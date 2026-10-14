import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnInit,
  output,
  signal,
  TemplateRef,
} from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { map, switchMap } from 'rxjs';
import { TablerIconComponent } from 'angular-tabler-icons';
import { toMessage } from '../../../../core/http/problem-details';
import { SpinnerComponent } from '../../../../shared/ui/spinner/spinner.component';
import { AmenitiesService } from '../data-access/amenities.service';
import {
  AMENITY_MAX_PHOTOS,
  AMENITY_MIN_PHOTOS,
  AMENITY_PHOTO_CONTENT_TYPES,
  AmenityPhoto,
} from '../data-access/amenity.models';

interface PhotoItem {
  key: string;
  url: string;
}

/**
 * Photo editor for an amenity: add (direct-to-storage upload), remove, reorder
 * (sort order is list order). Speaks `string[]` of storage keys via
 * `keysChange`, which `PUT /amenities/{id}` expects as the WHOLE set — so a
 * parent must resend this on every save, not only when it changed.
 *
 * The thumbnails open the same lightbox the PQRS detail uses (dark stage,
 * arrows, ←/→ keys, thumbnail strip). Unlike attachments, these URLs need no
 * signing — the amenity container is public (ADR-0016 §5), so a photo can be
 * rendered straight from the key's URL and never goes stale.
 */
@Component({
  selector: 'app-amenity-photos-editor',
  standalone: true,
  imports: [TablerIconComponent, SpinnerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './amenity-photos-editor.component.html',
  styles: [
    `
      /* Thumbnail grid: square tiles with their controls under the image. */
      .amenity-photo-tile {
        width: 7.5rem;
      }
      .amenity-photo-thumb {
        width: 100%;
        height: 5.5rem;
        object-fit: cover;
        border-radius: var(--tblr-border-radius) var(--tblr-border-radius) 0 0;
        background-color: var(--tblr-bg-surface-tertiary);
        cursor: pointer;
      }
      .amenity-photo-thumb:hover {
        opacity: 0.85;
      }
      .amenity-photo-cover {
        position: absolute;
        top: 0.25rem;
        left: 0.25rem;
      }
      .amenity-photo-add {
        width: 7.5rem;
        height: 8.6rem;
        cursor: pointer;
      }

      /* Lightbox: same stage the request detail uses. */
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
export class AmenityPhotosEditorComponent implements OnInit {
  private readonly service = inject(AmenitiesService);
  private readonly modal = inject(NgbModal);

  /** Existing photos when editing; empty for a new amenity. */
  readonly photos = input<readonly AmenityPhoto[]>([]);

  /** Emits the ordered key list on every change, including the initial one. */
  readonly keysChange = output<string[]>();

  readonly items = signal<PhotoItem[]>([]);
  readonly uploading = signal(false);
  readonly error = signal<string | null>(null);

  /** Photos whose <img> failed to render (format the browser can't decode). */
  private readonly brokenPreviews = signal<Record<string, true>>({});

  readonly viewerIndex = signal(0);
  readonly viewerPhoto = computed<PhotoItem | null>(
    () => this.items()[this.viewerIndex()] ?? null,
  );

  readonly minPhotos = AMENITY_MIN_PHOTOS;
  readonly maxPhotos = AMENITY_MAX_PHOTOS;
  readonly acceptedTypes = AMENITY_PHOTO_CONTENT_TYPES.join(',');

  ngOnInit(): void {
    this.items.set(
      [...this.photos()]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((p) => ({ key: p.key, url: p.url })),
    );
    this.emitKeys();
  }

  onFileSelected(event: Event): void {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    target.value = ''; // allow re-picking the same file after an error
    if (!file) return;

    this.error.set(null);

    if (!AMENITY_PHOTO_CONTENT_TYPES.includes(file.type)) {
      this.error.set('Formato no permitido. Usa PNG, JPG o WEBP.');
      return;
    }
    if (this.items().length >= this.maxPhotos) {
      this.error.set(`No puedes agregar más de ${this.maxPhotos} fotos.`);
      return;
    }

    this.uploading.set(true);
    this.service
      .createPhotoUploadUrl({ contentType: file.type })
      .pipe(
        switchMap((ticket) =>
          this.service.uploadPhoto(ticket.uploadUrl, file).pipe(map(() => ticket)),
        ),
      )
      .subscribe({
        next: (ticket) => {
          this.uploading.set(false);
          this.items.update((list) => [...list, { key: ticket.key, url: ticket.url }]);
          this.emitKeys();
        },
        error: (error: HttpErrorResponse) => {
          this.uploading.set(false);
          this.error.set(
            error.status === 0 || !error.error?.title
              ? 'No se pudo subir la foto. Inténtalo de nuevo.'
              : toMessage(error),
          );
        },
      });
  }

  remove(index: number): void {
    this.items.update((list) => list.filter((_, i) => i !== index));
    this.emitKeys();
  }

  moveUp(index: number): void {
    if (index <= 0) return;
    this.swap(index, index - 1);
  }

  moveDown(index: number): void {
    if (index >= this.items().length - 1) return;
    this.swap(index, index + 1);
  }

  // ── Lightbox ──────────────────────────────────────────────────────────────

  /** Open the gallery on the clicked photo; arrow keys move through the rest. */
  openViewer(index: number, tpl: TemplateRef<unknown>): void {
    if (!this.items()[index]) return;

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
  }

  viewerNext(): void {
    const count = this.items().length;
    if (count > 0) this.viewerIndex.update((i) => (i + 1) % count);
  }

  viewerPrev(): void {
    const count = this.items().length;
    if (count > 0) this.viewerIndex.update((i) => (i - 1 + count) % count);
  }

  viewerGoTo(index: number): void {
    this.viewerIndex.set(index);
  }

  isBrokenPreview(key: string): boolean {
    return key in this.brokenPreviews();
  }

  onPreviewError(key: string): void {
    this.brokenPreviews.update((prev) => ({ ...prev, [key]: true }));
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private swap(i: number, j: number): void {
    const list = [...this.items()];
    [list[i], list[j]] = [list[j], list[i]];
    this.items.set(list);
    this.emitKeys();
  }

  private emitKeys(): void {
    this.keysChange.emit(this.items().map((p) => p.key));
  }
}
