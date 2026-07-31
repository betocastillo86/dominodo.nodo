import {
  ApplicationConfig,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideTablerIcons } from 'angular-tabler-icons';
import {
  IconArchive,
  IconArrowLeft,
  IconBuildingCommunity,
  IconDeviceFloppy,
  IconEdit,
  IconEye,
  IconLogout,
  IconPlus,
  IconSend,
  IconSpeakerphone,
  IconUserCircle,
  IconX,
} from 'angular-tabler-icons/icons';

import { routes } from './app.routes';
import { tenantInterceptor } from './core/http/tenant.interceptor';
import { authInterceptor } from './core/http/auth.interceptor';
import { errorInterceptor } from './core/http/error.interceptor';
import { tenantBootstrap } from './core/tenant/tenant.bootstrap';
import { authBootstrap } from './core/auth/auth.bootstrap';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    // Interceptor order matters: tenantInterceptor → authInterceptor → errorInterceptor.
    provideHttpClient(withInterceptors([tenantInterceptor, authInterceptor, errorInterceptor])),
    // Tenant first (sets the slug → X-Tenant), then the auth snapshot which
    // depends on that header being present.
    provideAppInitializer(tenantBootstrap()),
    provideAppInitializer(authBootstrap()),
    // Icons used across layout/login/shared-ui. Add more as feature modules need them
    // (every `<tabler-icon name="x">` requires its IconX registered here, or it renders blank).
    provideTablerIcons({
      IconBuildingCommunity,
      IconUserCircle,
      IconLogout,
      IconEdit,
      IconSpeakerphone,
      IconEye,
      IconArrowLeft,
      IconSend,
      IconArchive,
      IconDeviceFloppy,
      IconPlus,
      IconX,
    }),
  ],
};
