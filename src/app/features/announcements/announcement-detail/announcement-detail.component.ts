import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
  TemplateRef,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { Observable } from 'rxjs';
import { TablerIconComponent } from 'angular-tabler-icons';
import { PermissionStore } from '../../../core/authz/permission.store';
import { toMessage } from '../../../core/http/problem-details';
import { NotificationService } from '../../../core/notifications/notification.service';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { SpinnerComponent } from '../../../shared/ui/spinner/spinner.component';
import { AnnouncementsService } from '../data-access/announcements.service';
import { AnnouncementDetail } from '../data-access/announcement.models';
import {
  displayStateBadgeClass,
  displayStateLabel,
  getDisplayState,
} from '../data-access/announcement-status.util';
import { ANNOUNCEMENTS_EDIT } from '../data-access/announcement.permissions';
import { RequestCategoriesService } from '../data-access/request-categories.service';
import { audienceTypeLabel } from '../shared/audience';
import { priorityLabel } from '../shared/priority';
import { formatDateTime } from '../shared/format-date';

/**
 * Read view for a single announcement. Shows the derived display state
 * (Activo/Borrador/Expirado/Archivado) prominently and exposes the lifecycle
 * actions (editar / publicar / archivar) an administrator needs, each gated by
 * permission (UX only — the server is authoritative).
 */
@Component({
  selector: 'app-announcement-detail',
  standalone: true,
  imports: [RouterLink, TablerIconComponent, PageHeaderComponent, SpinnerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './announcement-detail.component.html',
})
export class AnnouncementDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(AnnouncementsService);
  private readonly permissions = inject(PermissionStore);
  private readonly notifications = inject(NotificationService);
  private readonly modal = inject(NgbModal);
  private readonly categoriesService = inject(RequestCategoriesService);

  private id = '';

  readonly announcement = signal<AnnouncementDetail | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly pending = signal(false);

  readonly displayState = computed(() => {
    const a = this.announcement();
    return a ? getDisplayState(a) : null;
  });
  readonly stateLabel = computed(() => {
    const s = this.displayState();
    return s ? displayStateLabel(s) : '';
  });
  readonly stateBadgeClass = computed(() => {
    const s = this.displayState();
    return s ? displayStateBadgeClass(s) : '';
  });

  readonly categoryName = computed(() => {
    const a = this.announcement();
    if (!a?.categoryId) {
      return null;
    }
    const cat = this.categoriesService.categories().find((c) => c.id === a.categoryId);
    return cat?.name ?? null;
  });

  readonly canEdit = computed(() => this.hasPermission(ANNOUNCEMENTS_EDIT));
  readonly canPublish = computed(
    () => this.announcement()?.status === 'Draft' && this.hasPermission(ANNOUNCEMENTS_EDIT),
  );
  readonly canArchive = computed(
    () => this.announcement()?.status !== 'Archived' && this.hasPermission(ANNOUNCEMENTS_EDIT),
  );

  ngOnInit(): void {
    this.id = this.route.snapshot.paramMap.get('id') ?? '';
    this.categoriesService.load();
    this.fetch();
  }

  audienceLabel(): string {
    const a = this.announcement();
    return a ? audienceTypeLabel(a.audienceType) : '';
  }

  priorityLabel = priorityLabel;

  formatDateTime = formatDateTime;

  confirmPublish(tpl: TemplateRef<unknown>): void {
    this.modal.open(tpl).result.then(
      () => this.runTransition(this.service.publish(this.id), 'Anuncio publicado.'),
      () => undefined,
    );
  }

  confirmArchive(tpl: TemplateRef<unknown>): void {
    this.modal.open(tpl).result.then(
      () => this.runTransition(this.service.archive(this.id), 'Anuncio archivado.'),
      () => undefined,
    );
  }

  private runTransition(op: Observable<void>, successMessage: string): void {
    this.pending.set(true);
    op.subscribe({
      next: () => {
        this.notifications.success(successMessage);
        this.fetch();
      },
      error: (error: HttpErrorResponse) => {
        this.pending.set(false);
        this.notifications.error(toMessage(error));
      },
    });
  }

  private fetch(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.getById(this.id).subscribe({
      next: (a) => {
        this.announcement.set(a);
        this.loading.set(false);
        this.pending.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.error.set(toMessage(error));
        this.loading.set(false);
        this.pending.set(false);
      },
    });
  }

  /** Permissive only until the current-user snapshot has loaded. */
  private hasPermission(code: string): boolean {
    return !this.permissions.loaded() || this.permissions.has(code);
  }
}
