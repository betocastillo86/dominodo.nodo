import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnDestroy,
  OnInit,
  signal,
  TemplateRef,
} from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { TablerIconComponent } from 'angular-tabler-icons';
import { map, switchMap } from 'rxjs';
import { toMessage } from '../../../core/http/problem-details';
import { NotificationService } from '../../../core/notifications/notification.service';
import { TenantStore } from '../../../core/tenant/tenant.store';
import {
  applyTenantTheme,
  DEFAULT_TENANT_THEME,
  resolveTheme,
  TENANT_THEMES,
  TenantThemeValue,
} from '../../../core/tenant/tenant-theme';
import { SpinnerComponent } from '../../../shared/ui/spinner/spinner.component';
import {
  BrandingDto,
  LOGO_CONTENT_TYPES,
  LOGO_MAX_BYTES,
  logoKeyFromUrl,
  withCacheBuster,
} from '../data-access/tenant-branding.models';
import { TenantBrandingService } from '../data-access/tenant-branding.service';

/**
 * "Tema" tab of Mi Conjunto: the palette the portal paints with, plus the
 * conjunto's logo.
 *
 * The logo is NOT part of the form value — it is uploaded straight to storage as
 * soon as it is picked (so the admin sees it before saving) and only its key is
 * carried until the save adopts it. Removing it is the same command with a null
 * key; there is no DELETE.
 */
@Component({
  selector: 'app-tenant-branding-form',
  standalone: true,
  imports: [TablerIconComponent, SpinnerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tenant-branding-form.component.html',
})
export class TenantBrandingFormComponent implements OnInit, OnDestroy {
  private readonly service = inject(TenantBrandingService);
  private readonly notifications = inject(NotificationService);
  private readonly modal = inject(NgbModal);
  private readonly tenant = inject(TenantStore);

  readonly themes = TENANT_THEMES;
  readonly maxBytesLabel = `${LOGO_MAX_BYTES / (1024 * 1024)} MB`;
  readonly acceptedTypes = LOGO_CONTENT_TYPES.join(',');

  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly uploading = signal(false);
  readonly formError = signal<string | null>(null);
  readonly logoError = signal<string | null>(null);

  /** Selected palette; the swatch grid writes it. */
  readonly theme = signal<TenantThemeValue>(DEFAULT_TENANT_THEME);
  /** Preview of the current logo (either the stored one or the just-uploaded one). */
  readonly logoUrl = signal<string | null>(null);
  /** Key the save will adopt. Null means "the conjunto has no logo". */
  readonly logoKey = signal<string | null>(null);
  /** True when a logo exists but its key could not be read back off the URL. */
  readonly logoKeyUnresolved = signal(false);
  /** Enables the save button only once something actually changed. */
  readonly dirty = signal(false);

  /** The palette currently persisted — what the live preview must roll back to. */
  private storedTheme: TenantThemeValue = DEFAULT_TENANT_THEME;

  ngOnInit(): void {
    this.fetch();
  }

  /** Leaving with an unsaved palette must not keep the portal painted with it. */
  ngOnDestroy(): void {
    if (this.theme() !== this.storedTheme) {
      applyTenantTheme(this.storedTheme);
    }
  }

  selectTheme(value: TenantThemeValue): void {
    if (this.theme() === value) return;
    this.theme.set(value);
    this.dirty.set(true);
    // Immediate feedback: the whole portal repaints while the admin browses
    // palettes. A reload without saving restores the stored one.
    applyTenantTheme(value);
  }

  /** Picks a file, validates it against the purpose policy and uploads it. */
  onLogoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow re-picking the same file after an error
    if (!file) return;

    this.logoError.set(null);

    if (!LOGO_CONTENT_TYPES.includes(file.type)) {
      this.logoError.set('Formato no permitido. Usa PNG, JPG o WEBP.');
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      this.logoError.set(`La imagen supera el máximo de ${this.maxBytesLabel}.`);
      return;
    }

    this.uploading.set(true);
    this.service
      .createUploadUrl({
        purpose: 'BrandingLogo',
        fileName: file.name,
        contentType: file.type,
      })
      .pipe(
        switchMap((ticket) => this.service.upload(ticket.uploadUrl, file).pipe(map(() => ticket))),
      )
      .subscribe({
        next: (ticket) => {
          this.uploading.set(false);
          this.logoKey.set(ticket.key);
          this.logoKeyUnresolved.set(false);
          this.logoUrl.set(withCacheBuster(ticket.url, Date.now()));
          this.dirty.set(true);
        },
        error: (error: HttpErrorResponse) => {
          this.uploading.set(false);
          this.logoError.set(
            error.status === 0 || !error.error?.title
              ? 'No se pudo subir la imagen. Inténtalo de nuevo.'
              : toMessage(error),
          );
        },
      });
  }

  /** Stages the removal; it only takes effect when the branding is saved. */
  removeLogo(): void {
    if (!this.logoUrl() && !this.logoKey()) return;
    this.logoUrl.set(null);
    this.logoKey.set(null);
    this.logoKeyUnresolved.set(false);
    this.logoError.set(null);
    this.dirty.set(true);
  }

  confirmSave(tpl: TemplateRef<unknown>): void {
    if (this.saving() || this.uploading()) return;

    this.modal.open(tpl).result.then(
      () => this.save(),
      () => undefined,
    );
  }

  private save(): void {
    this.saving.set(true);
    this.formError.set(null);

    const theme = this.theme();
    const logoKey = this.logoKey();

    this.service.update({ theme, logoKey }).subscribe({
      next: () => {
        this.saving.set(false);
        this.dirty.set(false);
        this.storedTheme = theme;
        applyTenantTheme(theme);
        this.syncStore();
        this.notifications.success(
          logoKey
            ? 'Tema guardado. El logo puede tardar unos segundos en ajustarse.'
            : 'Tema guardado.',
        );
        // Normalization (256×256) happens asynchronously over the same key, so
        // re-reading is what eventually shows the final image.
        if (logoKey) this.refreshLogo();
      },
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        this.formError.set(toMessage(error));
      },
    });
  }

  /** Keeps the header logo and the palette in sync with what was just saved. */
  private syncStore(): void {
    const current = this.tenant.tenant();
    if (!current) return;

    this.tenant.setBranding({
      ...current.branding,
      theme: this.theme(),
      logoUrl: this.logoUrl(),
    });
  }

  private refreshLogo(): void {
    this.service.get().subscribe({
      next: (branding) => this.applyBranding(branding, Date.now()),
      error: () => undefined,
    });
  }

  private fetch(): void {
    this.loading.set(true);
    this.loadError.set(null);

    this.service.get().subscribe({
      next: (branding) => {
        this.applyBranding(branding, 0);
        this.dirty.set(false);
        this.loading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.loadError.set(toMessage(error));
        this.loading.set(false);
      },
    });
  }

  private applyBranding(branding: BrandingDto, cacheBuster: number): void {
    this.theme.set(resolveTheme(branding.theme).value);
    this.storedTheme = this.theme();

    const key = logoKeyFromUrl(branding.logoUrl);
    this.logoKey.set(key);
    this.logoKeyUnresolved.set(branding.logoUrl !== null && key === null);
    this.logoUrl.set(
      cacheBuster ? withCacheBuster(branding.logoUrl, cacheBuster) : branding.logoUrl,
    );
  }
}
