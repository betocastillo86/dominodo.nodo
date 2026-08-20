import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TablerIconComponent } from 'angular-tabler-icons';
import { toMessage } from '../../../core/http/problem-details';
import { NotificationService } from '../../../core/notifications/notification.service';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { KnowledgeResourcesService } from '../data-access/knowledge-resources.service';
import { CreateKnowledgeResourceRequest } from '../data-access/knowledge-resource.models';

@Component({
  selector: 'app-knowledge-resource-create',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, TablerIconComponent, PageHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './knowledge-resource-create.component.html',
})
export class KnowledgeResourceCreateComponent {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly service = inject(KnowledgeResourcesService);
  private readonly notifications = inject(NotificationService);

  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);

  readonly form = this.fb.group({
    title: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(200)]),
    body: this.fb.nonNullable.control('', [Validators.required]),
  });

  submit(): void {
    if (this.saving()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.formError.set(null);

    this.service.create(this.toRequest()).subscribe({
      next: () => {
        this.notifications.success('Recurso creado.');
        void this.router.navigate(['/knowledge-resources']);
      },
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        this.formError.set(toMessage(error));
      },
    });
  }

  private toRequest(): CreateKnowledgeResourceRequest {
    const v = this.form.getRawValue();
    return {
      title: v.title.trim(),
      body: v.body,
    };
  }
}
