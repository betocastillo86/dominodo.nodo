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
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { TablerIconComponent } from 'angular-tabler-icons';

import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { SpinnerComponent } from '../../../shared/ui/spinner/spinner.component';
import { PermissionStore } from '../../../core/authz/permission.store';
import { NotificationService } from '../../../core/notifications/notification.service';
import { toMessage } from '../../../core/http/problem-details';

import { RequestsService } from '../data-access/requests.service';
import { CategoriesLookupService, RequestCategoryDto } from '../data-access/categories-lookup.service';
import { UsersLookupService } from '../data-access/users-lookup.service';
import {
  ALLOWED_TRANSITIONS,
  BOARD_STATUSES,
  PARTICIPANT_TYPE_LABEL,
  PRIORITY_BADGE,
  PRIORITY_LABEL,
  RequestDetailDto,
  RequestPriority,
  RequestStatus,
  RequestType,
  RequestUpdateType,
  RequestVisibility,
  STATUS_BADGE,
  STATUS_LABEL,
  TYPE_LABEL,
  UPDATE_TYPE_BADGE,
  UPDATE_TYPE_LABEL,
} from '../data-access/request.models';

type DetailTab = 'info' | 'comments' | 'history';

@Component({
  selector: 'app-request-detail',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    TablerIconComponent,
    PageHeaderComponent,
    SpinnerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './request-detail.component.html',
  styles: [
    `
      /* Steps whose click triggers a status change: hint interactivity. */
      .steps .step-item.requests-step--clickable {
        cursor: pointer;
        font-weight: 600;
        color: var(--tblr-primary);
        text-decoration: none;
      }
      .steps .step-item.requests-step--clickable:hover {
        text-decoration: underline;
      }
    `,
  ],
})
export class RequestDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(RequestsService);
  private readonly categoriesLookup = inject(CategoriesLookupService);
  private readonly usersLookup = inject(UsersLookupService);
  private readonly permissions = inject(PermissionStore);
  private readonly notifications = inject(NotificationService);
  private readonly modal = inject(NgbModal);

  private readonly requestId = this.route.snapshot.paramMap.get('id')!;

  // ── Page state ────────────────────────────────────────────────────────────
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly detail = signal<RequestDetailDto | null>(null);
  readonly categories = signal<RequestCategoryDto[]>([]);
  /** userId → resolved profile, filled from `GET /users/{id}` for participants and comment authors. */
  readonly usersMap = signal<Record<string, { name: string; phone: string }>>({});

  readonly saving = signal(false);
  readonly statusSaving = signal(false);
  readonly addingComment = signal(false);
  readonly downloadingId = signal<string | null>(null);

  readonly activeTab = signal<DetailTab>('info');

  // ── Permissions ───────────────────────────────────────────────────────────
  readonly canEdit = computed(() => this.permissions.has('requests.edit'));

  // ── Derived state ─────────────────────────────────────────────────────────
  /** Page-header heading: request code followed by its title. */
  readonly headerTitle = computed(() => {
    const d = this.detail();
    return d ? `${d.code} · ${d.title}` : 'Detalle';
  });

  readonly currentStatusIndex = computed(() => {
    const d = this.detail();
    return d ? BOARD_STATUSES.indexOf(d.status) : -1;
  });

  readonly nextStatuses = computed((): RequestStatus[] => {
    const d = this.detail();
    return d ? (ALLOWED_TRANSITIONS[d.status] ?? []) : [];
  });

  /** Status-change history, newest first for the "Histórico" tab. */
  readonly statusHistory = computed(() => {
    const d = this.detail();
    if (!d) return [];
    return [...d.statusHistory].sort(
      (a, b) => new Date(b.changedAtUtc).getTime() - new Date(a.changedAtUtc).getTime(),
    );
  });

  /** Whether clicking a given step should trigger a status change (valid transition). */
  isClickableStatus(status: RequestStatus): boolean {
    return this.canEdit() && this.nextStatuses().includes(status);
  }

  /** Target status queued while the status-change modal is open. */
  readonly pendingStatus = signal<RequestStatus | null>(null);

  // ── Label maps (exposed to template) ─────────────────────────────────────
  readonly boardStatuses = BOARD_STATUSES;
  readonly statusLabel = STATUS_LABEL;
  readonly statusBadge = STATUS_BADGE;
  readonly priorityLabel = PRIORITY_LABEL;
  readonly priorityBadge = PRIORITY_BADGE;
  readonly typeLabel = TYPE_LABEL;
  readonly updateTypeLabel = UPDATE_TYPE_LABEL;
  readonly updateTypeBadge = UPDATE_TYPE_BADGE;
  readonly participantTypeLabel = PARTICIPANT_TYPE_LABEL;

  // ── Info form (editable fields only) ─────────────────────────────────────
  readonly infoForm = new FormGroup({
    type: new FormControl<RequestType>('Peticion', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    priority: new FormControl<RequestPriority>('Medium', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    visibility: new FormControl<RequestVisibility>('Private', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    categoryId: new FormControl<string>('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  // ── Status change (via modal triggered from the steps) ────────────────────
  readonly statusNoteControl = new FormControl<string>('', { nonNullable: true });

  // ── Comment form ──────────────────────────────────────────────────────────
  readonly commentForm = new FormGroup({
    type: new FormControl<RequestUpdateType>('Comment', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    body: new FormControl<string>('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(2000)],
    }),
    isInternal: new FormControl<boolean>(false, { nonNullable: true }),
  });

  constructor() {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);

    forkJoin({
      detail: this.service.getById(this.requestId),
      categories: this.categoriesLookup.getActive(),
    }).subscribe({
      next: ({ detail, categories }) => {
        this.detail.set(detail);
        this.categories.set(categories);

        this.infoForm.patchValue({
          type: detail.type,
          priority: detail.priority,
          visibility: detail.visibility,
          categoryId: detail.categoryId,
        });

        this.loading.set(false);
        this.loadUsers(detail);
      },
      error: (err: HttpErrorResponse) => {
        this.error.set(toMessage(err));
        this.loading.set(false);
      },
    });
  }

  /**
   * Resolve names/phones for every userId referenced by the request (participants
   * and comment authors) via `GET /users/{id}`, merging into the shared map.
   */
  private loadUsers(detail: RequestDetailDto): void {
    const ids = [
      ...detail.participants.map((p) => p.userId),
      ...detail.updates.map((u) => u.authorUserId),
      ...detail.statusHistory.map((h) => h.changedByUserId),
    ];
    this.usersLookup.getByIds(ids).subscribe((users) => {
      const map = { ...this.usersMap() };
      for (const u of users) {
        map[u.id] = { name: `${u.firstName} ${u.lastName}`.trim(), phone: u.phone };
      }
      this.usersMap.set(map);
    });
  }

  saveInfo(): void {
    if (!this.infoForm.valid || this.saving()) return;
    const d = this.detail();
    if (!d) return;

    this.saving.set(true);
    const { type, priority, visibility, categoryId } = this.infoForm.getRawValue();

    this.service
      .update(d.id, {
        type,
        title: d.title,
        description: d.description,
        priority,
        categoryId,
        location: d.location,
        metadata: d.metadata,
        visibility,
      })
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.notifications.success('Solicitud actualizada.');
          this.detail.update((prev) =>
            prev ? { ...prev, type, priority, visibility, categoryId } : prev,
          );
        },
        error: (err: HttpErrorResponse) => this.notifications.error(toMessage(err)),
      });
  }

  /** Open the status-change modal for a target status (clicked on a step). */
  openStatusModal(target: RequestStatus, tpl: TemplateRef<unknown>): void {
    if (!this.isClickableStatus(target) || this.statusSaving()) return;
    this.pendingStatus.set(target);
    this.statusNoteControl.setValue('');
    this.modal.open(tpl).result.then(
      () => this.changeStatus(target),
      () => this.pendingStatus.set(null),
    );
  }

  private changeStatus(newStatus: RequestStatus): void {
    const d = this.detail();
    if (!d) return;

    this.statusSaving.set(true);
    const note = this.statusNoteControl.value.trim() || null;

    this.service
      .changeStatus(d.id, newStatus, note)
      .pipe(finalize(() => {
        this.statusSaving.set(false);
        this.pendingStatus.set(null);
      }))
      .subscribe({
        next: () => {
          this.notifications.success(`Estado cambiado a «${STATUS_LABEL[newStatus]}».`);
          this.detail.update((prev) => (prev ? { ...prev, status: newStatus } : prev));
          // Reload to pick up the new status-history entry.
          this.service.getById(d.id).subscribe({
            next: (refreshed) => {
              this.detail.set(refreshed);
              this.loadUsers(refreshed);
            },
          });
        },
        error: (err: HttpErrorResponse) => this.notifications.error(toMessage(err)),
      });
  }

  addComment(): void {
    if (!this.commentForm.valid || this.addingComment()) return;
    const d = this.detail();
    if (!d) return;

    this.addingComment.set(true);
    const { type, body, isInternal } = this.commentForm.getRawValue();

    this.service
      .addUpdate(d.id, { type, body, isInternal })
      .pipe(finalize(() => this.addingComment.set(false)))
      .subscribe({
        next: () => {
          this.notifications.success('Respuesta agregada.');
          this.commentForm.reset({ type: 'Comment', body: '', isInternal: false });
          // Reload full detail to pick up the new update entry.
          this.service.getById(d.id).subscribe({
            next: (refreshed) => {
              this.detail.set(refreshed);
              this.loadUsers(refreshed);
            },
          });
        },
        error: (err: HttpErrorResponse) => this.notifications.error(toMessage(err)),
      });
  }

  downloadAttachment(attachmentId: string): void {
    const d = this.detail();
    if (!d || this.downloadingId()) return;

    this.downloadingId.set(attachmentId);
    this.service
      .getAttachmentDownloadUrl(d.id, attachmentId)
      .pipe(finalize(() => this.downloadingId.set(null)))
      .subscribe({
        next: (res) => window.open(res.url, '_blank'),
        error: (err: HttpErrorResponse) => this.notifications.error(toMessage(err)),
      });
  }

  // ── Template helpers ──────────────────────────────────────────────────────

  memberName(userId: string): string {
    return this.usersMap()[userId]?.name ?? 'Usuario';
  }

  memberPhone(userId: string): string {
    return this.usersMap()[userId]?.phone ?? '';
  }

  memberInitials(userId: string): string {
    const name = this.usersMap()[userId]?.name ?? '';
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    const first = parts[0]?.[0] ?? '?';
    const last = parts.length >= 2 ? (parts[parts.length - 1][0] ?? '') : '';
    return (first + last).toUpperCase();
  }

  categoryName(categoryId: string): string {
    return this.categories().find((c) => c.id === categoryId)?.name ?? '—';
  }

  formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    const dd = d.getDate().toString().padStart(2, '0');
    const mm = (d.getMonth() + 1).toString().padStart(2, '0');
    return `${dd}/${mm}/${d.getFullYear()}`;
  }

  formatDateTime(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
