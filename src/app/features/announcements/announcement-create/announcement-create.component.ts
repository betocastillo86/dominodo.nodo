import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TablerIconComponent } from 'angular-tabler-icons';
import { toMessage } from '../../../core/http/problem-details';
import { NotificationService } from '../../../core/notifications/notification.service';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { AnnouncementsService } from '../data-access/announcements.service';
import { AudienceType, CreateAnnouncementRequest } from '../data-access/announcement.models';
import { RequestCategoriesService } from '../data-access/request-categories.service';
import { AUDIENCE_OPTIONS } from '../shared/audience';
import { fromDatetimeLocal } from '../shared/format-date';

/**
 * Create form for a new announcement (`POST /announcements`). Mirrors the edit
 * form's fields; a new announcement starts as Draft, so publish/archive stay as
 * actions on the detail view once created.
 */
@Component({
  selector: 'app-announcement-create',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, TablerIconComponent, PageHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './announcement-create.component.html',
})
export class AnnouncementCreateComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly service = inject(AnnouncementsService);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);
  readonly categoriesService = inject(RequestCategoriesService);

  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);

  readonly audienceOptions = AUDIENCE_OPTIONS;

  readonly form = this.fb.group({
    title: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(200)]),
    body: this.fb.nonNullable.control('', [Validators.required]),
    priority: this.fb.nonNullable.control(0, [Validators.required, Validators.min(0)]),
    audienceType: this.fb.nonNullable.control<AudienceType>('AllTenant', [Validators.required]),
    audienceFilter: this.fb.control<string>(''),
    categoryId: this.fb.control<string>(''),
    expiresAtLocal: this.fb.control<string>(''),
  });

  /** `audienceFilter` is required unless the audience is the whole tenant. */
  readonly needsAudienceFilter = signal(false);

  ngOnInit(): void {
    this.categoriesService.load();

    this.form.controls.audienceType.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((type) => this.applyAudienceFilterRule(type));
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

    this.service.create(this.toRequest()).subscribe({
      next: (created) => {
        this.notifications.success('Anuncio creado.');
        void this.router.navigate(['/announcements', created.id]);
      },
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        this.formError.set(toMessage(error));
      },
    });
  }

  private toRequest(): CreateAnnouncementRequest {
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
