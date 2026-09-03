import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  TemplateRef,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { TablerIconComponent } from 'angular-tabler-icons';
import { map, Observable } from 'rxjs';
import { PermissionStore } from '../../../core/authz/permission.store';
import { toMessage } from '../../../core/http/problem-details';
import { NotificationService } from '../../../core/notifications/notification.service';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import {
  SearchSelectComponent,
  SearchSelectFn,
} from '../../../shared/ui/search-select/search-select.component';
import { SpinnerComponent } from '../../../shared/ui/spinner/spinner.component';
import {
  APARTMENT_TYPE_LABEL,
  ApartmentDetailDto,
  apartmentLabel,
  RELATION_BADGE,
  RELATION_LABEL,
  RESIDENTE_ROLE_ID,
  ResidentDto,
  ResidentRelationType,
} from '../data-access/apartment.models';
import {
  PRIORITY_BADGE,
  PRIORITY_LABEL,
  RequestDto,
  STATUS_BADGE,
  STATUS_LABEL,
  TYPE_LABEL,
} from '../../requests/data-access/request.models';
import { ApartmentRequestsService } from '../data-access/apartment-requests.service';
import { ApartmentsService } from '../data-access/apartments.service';
import { ResidentsLookupService } from '../data-access/residents-lookup.service';

/** E.164, matching the API's `InviteMemberCommandValidator`. */
const E164 = /^\+[1-9]\d{6,14}$/;

/**
 * Apartment detail. The apartment itself is read-only; what the administrator
 * manages here is its residents.
 *
 * Adding a resident takes one of two API paths, chosen by whether the person
 * already belongs to the conjunto:
 *  - picked from the typeahead → they already hold a membership, so
 *    `POST /apartments/{id}/residents` just links them (inviting again would
 *    409 Membership.AlreadyExists);
 *  - "registrar nueva persona" → `POST /memberships/invite` with
 *    roleId = Residente, which creates the user, the membership and (via a
 *    domain event) the apartment link.
 *
 * Removing is `PUT .../residents/{id}/end`: it disables the RESIDENCY, keeping
 * it as history. The membership is intentionally left alone — the API
 * deactivates it on its own when that is warranted.
 */
@Component({
  selector: 'app-apartment-detail',
  standalone: true,
  imports: [
    PageHeaderComponent,
    SpinnerComponent,
    EmptyStateComponent,
    SearchSelectComponent,
    ReactiveFormsModule,
    RouterLink,
    TablerIconComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './apartment-detail.component.html',
})
export class ApartmentDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(ApartmentsService);
  private readonly residentsLookup = inject(ResidentsLookupService);
  private readonly apartmentRequests = inject(ApartmentRequestsService);
  private readonly permissions = inject(PermissionStore);
  private readonly notifications = inject(NotificationService);
  private readonly modal = inject(NgbModal);

  private readonly id = this.route.snapshot.paramMap.get('id')!;

  readonly apartment = signal<ApartmentDetailDto | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly residents = signal<ResidentDto[]>([]);
  readonly residentsLoading = signal(true);
  readonly residentsError = signal<string | null>(null);

  readonly requests = signal<RequestDto[]>([]);
  readonly requestsTotal = signal(0);
  readonly requestsLoading = signal(false);
  readonly requestsError = signal<string | null>(null);

  /** In flight for the add / end-residency writes. */
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly submitted = signal(false);

  /** True while the form collects a brand-new person instead of an existing member. */
  readonly registerNew = signal(false);

  /** The residency the end-residency confirmation is currently about. */
  readonly targetResident = signal<ResidentDto | null>(null);

  /**
   * Held so the component closes the add dialog itself on success. The template
   * context's `$implicit` is the NgbActiveModal, so handing `modal.close` to a
   * handler would strip its `this` — keep the ref here instead.
   */
  private addModal: NgbModalRef | null = null;

  /** Linking an existing person needs apartments.edit; inviting needs memberships.manage. */
  readonly canEdit = computed(() => this.permissions.has('apartments.edit'));
  readonly canInvite = computed(() => this.permissions.has('memberships.manage'));
  readonly canAddResident = computed(() => this.canEdit() || this.canInvite());
  /** The apartment's PQRS card is only fetched (and shown) with requests.view. */
  readonly canViewRequests = computed(() => this.permissions.has('requests.view'));

  readonly activeResidents = computed(() => this.residents().filter((r) => r.isActive));
  readonly pastResidents = computed(() => this.residents().filter((r) => !r.isActive));

  readonly title = computed(() => {
    const a = this.apartment();
    return a ? `Apto. ${apartmentLabel(a)}` : 'Apartamento';
  });

  readonly addForm = new FormGroup({
    /** userId of an existing member, set by the typeahead. */
    userId: new FormControl<string | null>(null),
    phone: new FormControl('', { nonNullable: true }),
    firstName: new FormControl('', { nonNullable: true }),
    lastName: new FormControl('', { nonNullable: true }),
    email: new FormControl('', { nonNullable: true }),
    relationType: new FormControl<ResidentRelationType>('Owner', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    livesHere: new FormControl(true, { nonNullable: true }),
  });

  /** Typeahead over Active members — matches name, email or phone server-side. */
  readonly searchPeople: SearchSelectFn = (term) =>
    this.residentsLookup.search(term).pipe(
      map((items) =>
        items.map((m) => ({
          value: m.userId,
          label: m.userName,
          sublabel: m.phone,
        })),
      ),
    );

  readonly typeLabel = APARTMENT_TYPE_LABEL;
  readonly relationLabel = RELATION_LABEL;
  readonly relationBadge = RELATION_BADGE;
  readonly requestStatusLabel = STATUS_LABEL;
  readonly requestStatusBadge = STATUS_BADGE;
  readonly requestPriorityLabel = PRIORITY_LABEL;
  readonly requestPriorityBadge = PRIORITY_BADGE;
  readonly requestTypeLabel = TYPE_LABEL;

  /** Only the newest PQRS are shown inline; the footer reports the full count. */
  private readonly requestsPageSize = 10;

  constructor() {
    this.applyModeValidators();
    this.fetch();
    this.fetchResidents();
    if (this.canViewRequests()) {
      this.fetchRequests();
    }
  }

  // ── Add resident ───────────────────────────────────────────────────────────

  openAdd(tpl: TemplateRef<unknown>): void {
    this.resetAddForm();
    // Registering a new person is the default; the typeahead is the fallback,
    // and the only path at all without memberships.manage.
    this.registerNew.set(this.canInvite());
    this.applyModeValidators();
    this.addModal = this.modal.open(tpl);
    this.addModal.result.then(
      () => (this.addModal = null),
      () => (this.addModal = null),
    );
  }

  toggleRegisterNew(): void {
    this.registerNew.update((v) => !v);
    this.submitted.set(false);
    this.formError.set(null);
    this.applyModeValidators();
  }

  submitAdd(): void {
    this.submitted.set(true);
    this.formError.set(null);
    if (this.addForm.invalid) return;

    const value = this.addForm.getRawValue();
    const op: Observable<unknown> = this.registerNew()
      ? this.service.inviteResident({
          phone: value.phone.trim(),
          roleId: RESIDENTE_ROLE_ID,
          email: value.email.trim() || null,
          firstName: value.firstName.trim(),
          lastName: value.lastName.trim() || null,
          apartmentId: this.id,
          relationType: value.relationType,
          livesHere: value.livesHere,
        })
      : this.service.assignResident(this.id, {
          userId: value.userId!,
          relationType: value.relationType,
          livesHere: value.livesHere,
          startDate: today(),
        });

    this.saving.set(true);
    op.subscribe({
      next: () => {
        this.saving.set(false);
        this.addModal?.close();
        this.notifications.success('Residente agregado.');
        this.fetchResidents();
        // A brand-new person is linked to the apartment asynchronously by the
        // API, so the refetch above can land before the link exists.
        if (this.registerNew()) {
          this.notifications.info(
            'El residente puede tardar unos segundos en aparecer en la lista.',
          );
        }
      },
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        this.formError.set(toMessage(error));
      },
    });
  }

  // ── End residency (double confirmation) ────────────────────────────────────

  /**
   * Two sequential modals: the first states what happens, the second asks for a
   * final confirmation. Dismissing either one aborts without a write.
   */
  confirmEnd(
    resident: ResidentDto,
    firstStep: TemplateRef<unknown>,
    secondStep: TemplateRef<unknown>,
  ): void {
    this.targetResident.set(resident);
    this.modal.open(firstStep).result.then(
      () =>
        this.modal.open(secondStep).result.then(
          () => this.endResidency(resident),
          () => this.targetResident.set(null),
        ),
      () => this.targetResident.set(null),
    );
  }

  residentName(resident: ResidentDto | null): string {
    return resident?.user?.fullName?.trim() || 'este residente';
  }

  formatDate(value: string | null): string {
    if (!value) return '—';
    const [year, month, day] = value.slice(0, 10).split('-');
    return `${day}/${month}/${year}`;
  }

  /** `dd/mm/yyyy` from an ISO instant (PQRS timestamps, not DateOnly). */
  formatInstant(value: string): string {
    const d = new Date(value);
    const day = `${d.getDate()}`.padStart(2, '0');
    const month = `${d.getMonth() + 1}`.padStart(2, '0');
    return `${day}/${month}/${d.getFullYear()}`;
  }

  private fetchRequests(): void {
    this.requestsLoading.set(true);
    this.requestsError.set(null);
    this.apartmentRequests.list(this.id, 1, this.requestsPageSize).subscribe({
      next: (result) => {
        this.requests.set(result.items);
        this.requestsTotal.set(result.totalCount);
        this.requestsLoading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.requests.set([]);
        this.requestsTotal.set(0);
        this.requestsError.set(toMessage(error));
        this.requestsLoading.set(false);
      },
    });
  }

  private endResidency(resident: ResidentDto): void {
    this.saving.set(true);
    this.service.endResidency(this.id, resident.id, { endDate: today() }).subscribe({
      next: () => {
        this.saving.set(false);
        this.targetResident.set(null);
        this.notifications.success(`Residencia de ${this.residentName(resident)} finalizada.`);
        this.fetchResidents();
      },
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        this.targetResident.set(null);
        this.notifications.error(toMessage(error));
      },
    });
  }

  // ── Loading ────────────────────────────────────────────────────────────────

  private fetch(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.getById(this.id).subscribe({
      next: (a) => {
        this.apartment.set(a);
        this.loading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.error.set(toMessage(error));
        this.loading.set(false);
      },
    });
  }

  private fetchResidents(): void {
    this.residentsLoading.set(true);
    this.residentsError.set(null);
    this.service.listResidents(this.id).subscribe({
      next: (list) => {
        this.residents.set(list);
        this.residentsLoading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.residents.set([]);
        this.residentsError.set(toMessage(error));
        this.residentsLoading.set(false);
      },
    });
  }

  private resetAddForm(): void {
    this.addForm.reset({
      userId: null,
      phone: '',
      firstName: '',
      lastName: '',
      email: '',
      relationType: 'Owner',
      livesHere: true,
    });
    this.submitted.set(false);
    this.formError.set(null);
  }

  /**
   * The two paths need different required fields, so validators are swapped
   * whenever the mode changes rather than declared once on the group.
   */
  private applyModeValidators(): void {
    const { userId, phone, firstName, email } = this.addForm.controls;

    if (this.registerNew()) {
      userId.clearValidators();
      phone.setValidators([Validators.required, Validators.pattern(E164)]);
      // The API rejects an unknown phone without a first name (Membership.FirstNameRequired).
      firstName.setValidators([Validators.required, Validators.maxLength(100)]);
      email.setValidators([Validators.email]);
    } else {
      userId.setValidators([Validators.required]);
      phone.clearValidators();
      firstName.clearValidators();
      email.clearValidators();
    }

    for (const control of [userId, phone, firstName, email]) {
      control.updateValueAndValidity({ emitEvent: false });
    }
  }
}

/** Today as `YYYY-MM-DD` in local time — the DateOnly shape the API expects. */
function today(): string {
  const d = new Date();
  const month = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}
