import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, OnInit, signal, TemplateRef } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { TablerIconComponent } from 'angular-tabler-icons';
import { finalize } from 'rxjs';
import { CurrentUserResponse, Membership } from '../../../core/auth/auth.models';
import { AuthService } from '../../../core/auth/auth.service';
import { toMessage } from '../../../core/http/problem-details';
import { NotificationService } from '../../../core/notifications/notification.service';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { SpinnerComponent } from '../../../shared/ui/spinner/spinner.component';
import { ChangePasswordRequest } from '../data-access/profile.models';
import { ProfileService } from '../data-access/profile.service';

const USER_STATUS_BADGE: Record<string, string> = {
  PendingVerification: 'badge bg-yellow-lt',
  Active: 'badge bg-green-lt',
  Disabled: 'badge bg-secondary-lt',
};
const USER_STATUS_LABEL: Record<string, string> = {
  PendingVerification: 'Verificación pendiente',
  Active: 'Activa',
  Disabled: 'Deshabilitada',
};
const MEMBERSHIP_STATUS_BADGE: Record<string, string> = {
  Invited: 'badge bg-azure-lt',
  Active: 'badge bg-green-lt',
  Suspended: 'badge bg-red-lt',
};
const MEMBERSHIP_STATUS_LABEL: Record<string, string> = {
  Invited: 'Invitada',
  Active: 'Activa',
  Suspended: 'Suspendida',
};

/** Both new-password fields must match; flagged on the group, not on either control. */
function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const newPassword = group.get('newPassword')?.value;
  const confirmation = group.get('confirmPassword')?.value;
  return newPassword && confirmation && newPassword !== confirmation ? { mismatch: true } : null;
}

/**
 * "Mi perfil": the caller's own profile, read-only, plus the one action a user
 * can take on themselves — changing their own password. Reached from the
 * header user menu, not from the top navbar, so it carries no permission
 * guard: every authenticated member may see their own data (the shell's
 * `tenantMemberGuard` already required an Active membership to get this far).
 */
@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [ReactiveFormsModule, TablerIconComponent, PageHeaderComponent, SpinnerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile-page.component.html',
})
export class ProfilePageComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(ProfileService);
  private readonly auth = inject(AuthService);
  private readonly notifications = inject(NotificationService);
  private readonly modal = inject(NgbModal);

  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly profile = signal<CurrentUserResponse | null>(null);

  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly submitted = signal(false);

  readonly userStatusBadge = USER_STATUS_BADGE;
  readonly userStatusLabel = USER_STATUS_LABEL;
  readonly membershipStatusBadge = MEMBERSHIP_STATUS_BADGE;
  readonly membershipStatusLabel = MEMBERSHIP_STATUS_LABEL;

  /** Mirrors the API's own rules (`ChangePasswordCommandValidator`) so a typo fails here first. */
  readonly form = this.fb.group(
    {
      currentPassword: this.fb.nonNullable.control('', [Validators.required]),
      newPassword: this.fb.nonNullable.control('', [
        Validators.required,
        Validators.minLength(8),
        Validators.maxLength(128),
        Validators.pattern(/(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])/),
      ]),
      confirmPassword: this.fb.nonNullable.control('', [Validators.required]),
    },
    { validators: passwordsMatch },
  );

  private passwordModal: NgbModalRef | null = null;

  ngOnInit(): void {
    this.fetch();
  }

  /** The caller's Active membership in this tenant — normally the only one, since `tenantMemberGuard` already required it. */
  activeMembership(): Membership | null {
    return this.profile()?.memberships.find((m) => m.status === 'Active') ?? null;
  }

  openChangePassword(tpl: TemplateRef<unknown>): void {
    this.form.reset();
    this.submitted.set(false);
    this.formError.set(null);
    this.passwordModal = this.modal.open(tpl);
    this.passwordModal.result.then(
      () => (this.passwordModal = null),
      () => (this.passwordModal = null),
    );
  }

  submitChangePassword(): void {
    this.submitted.set(true);
    this.formError.set(null);
    if (this.form.invalid) return;

    const value = this.form.getRawValue();
    const body: ChangePasswordRequest = {
      currentPassword: value.currentPassword,
      newPassword: value.newPassword,
    };

    this.saving.set(true);
    this.service
      .changePassword(body)
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.passwordModal?.close();
          this.notifications.success('Contraseña actualizada. Vuelve a iniciar sesión.');
          // A successful change revokes every refresh token for this user on the
          // server, including the one backing this very session — so the access
          // token is living on borrowed time. Logging out now avoids a confusing
          // failure the next time it tries to refresh.
          this.auth.logout().subscribe();
        },
        error: (error: HttpErrorResponse) => this.formError.set(toMessage(error)),
      });
  }

  private fetch(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.service.getCurrent().subscribe({
      next: (response) => {
        this.profile.set(response);
        this.loading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.loadError.set(toMessage(error));
        this.loading.set(false);
      },
    });
  }
}
