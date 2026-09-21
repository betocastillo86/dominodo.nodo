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
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, finalize, map, tap } from 'rxjs/operators';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { TablerIconComponent } from 'angular-tabler-icons';

import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { SpinnerComponent } from '../../../shared/ui/spinner/spinner.component';
import { PermissionStore } from '../../../core/authz/permission.store';
import { NotificationService } from '../../../core/notifications/notification.service';
import { toMessage } from '../../../core/http/problem-details';

import { RequestsService } from '../data-access/requests.service';
import { CategoriesLookupService, RequestCategoryDto } from '../data-access/categories-lookup.service';
import {
  ALLOWED_TRANSITIONS,
  BOARD_STATUSES,
  isImageAttachment,
  PARTICIPANT_TYPE_LABEL,
  PRIORITY_BADGE,
  PRIORITY_LABEL,
  RequestAttachmentDto,
  RequestDetailDto,
  RequestParticipantApartmentDto,
  RequestPriority,
  RequestStatus,
  RequestType,
  RequestVisibility,
  STATUS_BADGE,
  STATUS_LABEL,
  TYPE_LABEL,
  UPDATE_TYPE_BADGE,
  UPDATE_TYPE_LABEL,
} from '../data-access/request.models';

type DetailTab = 'info' | 'history';

/** A minted SAS URL plus the epoch ms it stops working at. */
interface SignedUrl {
  url: string;
  expiresAt: number;
}

/**
 * Re-mint a cached SAS URL this long before it actually expires, so an image
 * that starts loading right at the edge still completes.
 */
const URL_REFRESH_MARGIN_MS = 60_000;

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

      /* Attachment list: square thumbnail standing in for the file icon. */
      .attachment-preview {
        width: 2.5rem;
        height: 2.5rem;
        flex-shrink: 0;
        border-radius: var(--tblr-border-radius);
        object-fit: cover;
        background-color: var(--tblr-bg-surface-tertiary);
        cursor: pointer;
      }
      .attachment-preview:hover {
        opacity: 0.8;
      }
      .attachment-preview--empty {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--tblr-secondary);
        cursor: default;
      }

      /* Lightbox: dark stage, contained image, overlaid arrows. */
      .lightbox-stage {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 60vh;
        background-color: #000;
      }
      .lightbox-image {
        max-width: 100%;
        max-height: 70vh;
        object-fit: contain;
      }
      .lightbox-nav {
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        z-index: 1;
        opacity: 0.85;
      }
      .lightbox-nav:hover {
        opacity: 1;
      }
      .lightbox-nav--prev {
        left: 0.75rem;
      }
      .lightbox-nav--next {
        right: 0.75rem;
      }
      .lightbox-thumb {
        width: 3.25rem;
        height: 3.25rem;
        flex-shrink: 0;
        border-radius: var(--tblr-border-radius);
        object-fit: cover;
        cursor: pointer;
        opacity: 0.5;
        border: 2px solid transparent;
      }
      .lightbox-thumb:hover {
        opacity: 0.85;
      }
      .lightbox-thumb.active {
        opacity: 1;
        border-color: var(--tblr-primary);
      }
    `,
  ],
})
export class RequestDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(RequestsService);
  private readonly categoriesLookup = inject(CategoriesLookupService);
  private readonly permissions = inject(PermissionStore);
  private readonly notifications = inject(NotificationService);
  private readonly modal = inject(NgbModal);

  private readonly requestId = this.route.snapshot.paramMap.get('id')!;

  // ── Page state ────────────────────────────────────────────────────────────
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly detail = signal<RequestDetailDto | null>(null);
  readonly categories = signal<RequestCategoryDto[]>([]);

  /**
   * userId → display name, derived from the participants embedded in the detail
   * response. Comment and status-history authors are resolved through this map;
   * an author who is not a participant falls back to a generic label.
   */
  private readonly participantNames = computed<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const p of this.detail()?.participants ?? []) {
      map[p.userId] = p.user.fullName;
    }
    return map;
  });

  readonly saving = signal(false);
  readonly statusSaving = signal(false);
  readonly addingComment = signal(false);
  readonly downloadingId = signal<string | null>(null);

  readonly activeTab = signal<DetailTab>('info');

  // ── Attachment previews & lightbox ────────────────────────────────────────
  /** attachmentId → signed URL, shared by the list thumbnails and the lightbox. */
  private readonly signedUrls = signal<Record<string, SignedUrl>>({});
  /** Attachments whose <img> failed to render (format the browser can't decode). */
  private readonly brokenPreviews = signal<Record<string, true>>({});
  readonly previewsLoading = signal(false);
  readonly viewerIndex = signal(0);

  /** Image attachments in list order — the lightbox navigates over exactly these. */
  readonly imageAttachments = computed(() =>
    (this.detail()?.attachments ?? []).filter(isImageAttachment),
  );

  readonly viewerAttachment = computed<RequestAttachmentDto | null>(
    () => this.imageAttachments()[this.viewerIndex()] ?? null,
  );

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
  // Every update posted from here is a plain comment — the type selector was
  // dropped, so `Comment` is sent unconditionally.
  readonly commentForm = new FormGroup({
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
        this.loadPreviews(detail.attachments);

        this.infoForm.patchValue({
          type: detail.type,
          priority: detail.priority,
          visibility: detail.visibility,
          categoryId: detail.categoryId,
        });

        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.error.set(toMessage(err));
        this.loading.set(false);
      },
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
            next: (refreshed) => this.detail.set(refreshed),
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
    const { body, isInternal } = this.commentForm.getRawValue();

    this.service
      .addUpdate(d.id, { type: 'Comment', body, isInternal })
      .pipe(finalize(() => this.addingComment.set(false)))
      .subscribe({
        next: () => {
          this.notifications.success('Respuesta agregada.');
          this.commentForm.reset({ body: '', isInternal: false });
          // Reload full detail to pick up the new update entry.
          this.service.getById(d.id).subscribe({
            next: (refreshed) => this.detail.set(refreshed),
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

  // ── Attachment previews ───────────────────────────────────────────────────

  isImage(attachment: RequestAttachmentDto): boolean {
    return isImageAttachment(attachment);
  }

  /** Signed URL for an attachment, or null while it is still being minted. */
  previewUrl(attachmentId: string): string | null {
    return this.signedUrls()[attachmentId]?.url ?? null;
  }

  /** True once the browser failed to decode this attachment — fall back to the icon. */
  isBrokenPreview(attachmentId: string): boolean {
    return attachmentId in this.brokenPreviews();
  }

  onPreviewError(attachmentId: string): void {
    this.brokenPreviews.update((prev) => ({ ...prev, [attachmentId]: true }));
  }

  /** Mint the URLs the given image attachments still need, without blocking the page. */
  private loadPreviews(attachments: RequestAttachmentDto[]): void {
    const images = attachments.filter(isImageAttachment);
    if (images.length === 0) return;

    this.previewsLoading.set(true);
    this.refreshSignedUrls(images)
      .pipe(finalize(() => this.previewsLoading.set(false)))
      .subscribe();
  }

  private refreshSignedUrls(attachments: RequestAttachmentDto[]): Observable<unknown> {
    const stale = attachments.filter((a) => !this.hasFreshUrl(a.id));
    if (stale.length === 0) return of(null);
    return forkJoin(stale.map((a) => this.mintUrl(a.id)));
  }

  private hasFreshUrl(attachmentId: string): boolean {
    const entry = this.signedUrls()[attachmentId];
    return !!entry && entry.expiresAt - Date.now() > URL_REFRESH_MARGIN_MS;
  }

  private mintUrl(attachmentId: string): Observable<SignedUrl | null> {
    return this.service.getAttachmentDownloadUrl(this.requestId, attachmentId).pipe(
      map((res) => {
        const parsed = new Date(res.expiresAtUtc).getTime();
        return {
          url: res.url,
          // An unparseable expiry would keep every read re-minting; assume the
          // API's ~5 min TTL instead.
          expiresAt: Number.isNaN(parsed) ? Date.now() + 5 * 60_000 : parsed,
        };
      }),
      tap((entry) => {
        this.signedUrls.update((prev) => ({ ...prev, [attachmentId]: entry }));
        this.brokenPreviews.update((prev) => {
          const { [attachmentId]: _removed, ...rest } = prev;
          return rest;
        });
      }),
      // One dead attachment must not sink the whole batch.
      catchError(() => of(null)),
    );
  }

  // ── Lightbox ──────────────────────────────────────────────────────────────

  /** Open the gallery on the clicked image; arrow keys move through the rest. */
  openViewer(attachment: RequestAttachmentDto, tpl: TemplateRef<unknown>): void {
    const images = this.imageAttachments();
    const index = images.findIndex((a) => a.id === attachment.id);
    if (index < 0) return;

    this.viewerIndex.set(index);
    const ref = this.modal.open(tpl, { size: 'xl', centered: true });

    // Esc is ng-bootstrap's; the arrows are ours. The listener lives only as
    // long as the modal does.
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') this.viewerNext();
      else if (event.key === 'ArrowLeft') this.viewerPrev();
    };
    document.addEventListener('keydown', onKeydown);
    ref.hidden.subscribe(() => document.removeEventListener('keydown', onKeydown));

    // Re-mint whatever lapsed while the page sat open (the SAS lives ~5 min).
    this.loadPreviews(images);
  }

  viewerNext(): void {
    const count = this.imageAttachments().length;
    if (count > 0) this.viewerIndex.update((i) => (i + 1) % count);
  }

  viewerPrev(): void {
    const count = this.imageAttachments().length;
    if (count > 0) this.viewerIndex.update((i) => (i - 1 + count) % count);
  }

  viewerGoTo(index: number): void {
    this.viewerIndex.set(index);
  }

  // ── Template helpers ──────────────────────────────────────────────────────

  /** Display name for a comment or status-history author. */
  memberName(userId: string): string {
    return this.participantNames()[userId] ?? 'Usuario';
  }

  memberInitials(userId: string): string {
    return this.initials(this.participantNames()[userId] ?? '');
  }

  /** First + last initial of a full name, for the avatar placeholders. */
  initials(fullName: string): string {
    const name = fullName.trim();
    if (!name) return '?';
    const parts = name.split(/\s+/);
    const first = parts[0]?.[0] ?? '?';
    const last = parts.length >= 2 ? (parts[parts.length - 1][0] ?? '') : '';
    return (first + last).toUpperCase();
  }

  /** `Torre · Número` when the apartment has a tower, otherwise just the number. */
  apartmentLabel(apartment: RequestParticipantApartmentDto): string {
    return apartment.tower ? `${apartment.tower} · ${apartment.number}` : apartment.number;
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
