import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TablerIconComponent } from 'angular-tabler-icons';
import { AuthService } from '../../../core/auth/auth.service';
import { toMessage } from '../../../core/http/problem-details';
import { TenantStore } from '../../../core/tenant/tenant.store';

/**
 * Branded sign-in screen. Reads tenant name/logo/loginText from TenantStore.
 * No SuperAdmin gate — any authenticated member may enter; access is decided by
 * tenant membership + permissions after login.
 */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, TablerIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login.component.html',
})
export class LoginComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly tenant = inject(TenantStore);

  readonly pending = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly form = this.fb.group({
    phone: ['', [Validators.required]],
    password: ['', [Validators.required]],
  });

  submit(): void {
    if (this.form.invalid || this.pending()) {
      this.form.markAllAsTouched();
      return;
    }

    this.pending.set(true);
    this.errorMessage.set(null);

    this.auth.login(this.form.getRawValue()).subscribe({
      next: () => {
        this.pending.set(false);
        void this.router.navigate(['/']);
      },
      error: (error: unknown) => {
        this.pending.set(false);
        this.errorMessage.set(this.describe(error));
      },
    });
  }

  private describe(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      return toMessage(error);
    }
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return 'No se pudo iniciar sesión. Verifica tus credenciales.';
  }
}
