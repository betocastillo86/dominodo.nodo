import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TablerIconComponent } from 'angular-tabler-icons';
import { toMessage } from '../../../core/http/problem-details';
import { NotificationService } from '../../../core/notifications/notification.service';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { SpinnerComponent } from '../../../shared/ui/spinner/spinner.component';
import { KnowledgeResourcesService } from '../data-access/knowledge-resources.service';
import {
  KnowledgeResourceStatus,
  UpdateKnowledgeResourceRequest,
} from '../data-access/knowledge-resource.models';

@Component({
  selector: 'app-knowledge-resource-edit',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, TablerIconComponent, PageHeaderComponent, SpinnerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './knowledge-resource-edit.component.html',
})
export class KnowledgeResourceEditComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(KnowledgeResourcesService);
  private readonly notifications = inject(NotificationService);

  protected id = '';

  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);

  readonly statusOptions: readonly { value: KnowledgeResourceStatus; label: string }[] = [
    { value: 'Draft', label: 'Borrador' },
    { value: 'Published', label: 'Publicado' },
    { value: 'Archived', label: 'Archivado' },
  ];

  readonly form = this.fb.group({
    title: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(200)]),
    body: this.fb.nonNullable.control('', [Validators.required]),
    status: this.fb.nonNullable.control<KnowledgeResourceStatus>('Draft', [Validators.required]),
  });

  ngOnInit(): void {
    this.id = this.route.snapshot.paramMap.get('id') ?? '';
    this.fetch();
  }

  submit(): void {
    if (this.saving()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.formError.set(null);

    this.service.update(this.id, this.toRequest()).subscribe({
      next: () => {
        this.notifications.success('Recurso actualizado.');
        void this.router.navigate(['/knowledge-resources']);
      },
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        this.formError.set(toMessage(error));
      },
    });
  }

  private toRequest(): UpdateKnowledgeResourceRequest {
    const v = this.form.getRawValue();
    return {
      title: v.title.trim(),
      body: v.body,
      status: v.status,
    };
  }

  private fetch(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.service.getById(this.id).subscribe({
      next: (r) => {
        this.form.patchValue({
          title: r.title,
          body: r.body,
          status: r.status,
        });
        this.loading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.loadError.set(toMessage(error));
        this.loading.set(false);
      },
    });
  }
}
