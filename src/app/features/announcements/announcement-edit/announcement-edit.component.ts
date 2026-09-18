import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TablerIconComponent } from 'angular-tabler-icons';
import { toMessage } from '../../../core/http/problem-details';
import { NotificationService } from '../../../core/notifications/notification.service';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { SpinnerComponent } from '../../../shared/ui/spinner/spinner.component';
import { AnnouncementsService } from '../data-access/announcements.service';
import {
  AnnouncementDetail,
  AnnouncementPriority,
  AudienceType,
  UpdateAnnouncementRequest,
} from '../data-access/announcement.models';
import {
  displayStateBadgeClass,
  displayStateLabel,
  getDisplayState,
} from '../data-access/announcement-status.util';
import { RequestCategoriesService } from '../data-access/request-categories.service';
import { AUDIENCE_OPTIONS } from '../shared/audience';
import { DEFAULT_PRIORITY, PRIORITY_OPTIONS } from '../shared/priority';
import { fromDatetimeLocal, toDatetimeLocal } from '../shared/format-date';

/**
 * Edit form for an existing announcement (`PUT /announcements/{id}`). Lifecycle
 * transitions (publish/archive) stay as actions on the detail view, not fields
 * here. The current display state is shown read-only for context.
 */
@Component({
  selector: 'app-announcement-edit',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    TablerIconComponent,
    PageHeaderComponent,
    SpinnerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './announcement-edit.component.html',
})
export class AnnouncementEditComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(AnnouncementsService);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);
  readonly categoriesService = inject(RequestCategoriesService);

  protected id = '';

  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  private readonly current = signal<AnnouncementDetail | null>(null);

  readonly audienceOptions = AUDIENCE_OPTIONS;
  readonly priorityOptions = PRIORITY_OPTIONS;

  readonly stateLabel = computed(() => {
    const a = this.current();
    return a ? displayStateLabel(getDisplayState(a)) : '';
  });
  readonly stateBadgeClass = computed(() => {
    const a = this.current();
    return a ? displayStateBadgeClass(getDisplayState(a)) : '';
  });

  readonly form = this.fb.group({
    title: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(200)]),
    body: this.fb.nonNullable.control('', [Validators.required]),
    priority: this.fb.nonNullable.control<AnnouncementPriority>(DEFAULT_PRIORITY, [
      Validators.required,
    ]),
    audienceType: this.fb.nonNullable.control<AudienceType>('AllTenant', [Validators.required]),
    audienceFilter: this.fb.control<string>(''),
    categoryId: this.fb.control<string>(''),
    expiresAtLocal: this.fb.control<string>(''),
  });

  /** `audienceFilter` is required unless the audience is the whole tenant. */
  readonly needsAudienceFilter = signal(false);

  ngOnInit(): void {
    this.id = this.route.snapshot.paramMap.get('id') ?? '';
    this.categoriesService.load();

    this.form.controls.audienceType.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((type) => this.applyAudienceFilterRule(type));

    this.fetch();
  }

  submit(): void {
    if (this.saving()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.formError.set(null);

    this.service.update(this.id, this.toRequest()).subscribe({
      next: () => {
        this.notifications.success('Anuncio actualizado.');
        void this.router.navigate(['/announcements', this.id]);
      },
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        this.formError.set(toMessage(error));
      },
    });
  }

  private toRequest(): UpdateAnnouncementRequest {
    const v = this.form.getRawValue();
    return {
      title: v.title.trim(),
      body: v.body,
      priority: v.priority,
      audienceType: v.audienceType,
      audienceFilter: v.audienceFilter?.trim() ? v.audienceFilter.trim() : null,
      categoryId: v.categoryId || null,
      expiresAtUtc: fromDatetimeLocal(v.expiresAtLocal),
    };
  }

  private fetch(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.service.getById(this.id).subscribe({
      next: (a) => {
        this.current.set(a);
        this.form.patchValue({
          title: a.title,
          body: a.body,
          priority: a.priority,
          audienceType: a.audienceType,
          audienceFilter: a.audienceFilter ?? '',
          categoryId: a.categoryId ?? '',
          expiresAtLocal: toDatetimeLocal(a.expiresAtUtc),
        });
        this.applyAudienceFilterRule(a.audienceType);
        this.loading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.loadError.set(toMessage(error));
        this.loading.set(false);
      },
    });
  }

  private applyAudienceFilterRule(type: AudienceType): void {
    const needs = type !== 'AllTenant';
    this.needsAudienceFilter.set(needs);
    const control = this.form.controls.audienceFilter;
    if (needs) {
      control.addValidators(Validators.required);
    } else {
      control.removeValidators(Validators.required);
      control.setValue('');
    }
    control.updateValueAndValidity({ emitEvent: false });
  }
}
