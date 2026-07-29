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
  IconBuildingCommunity,
  IconEdit,
  IconLogout,
  IconUserCircle,
} from 'angular-tabler-icons/icons';

import { routes } from './app.routes';
import { tenantInterceptor } from './core/http/tenant.interceptor';
import { authInterceptor } from './core/http/auth.interceptor';
import { errorInterceptor } from './core/http/error.interceptor';
import { tenantBootstrap } from './core/tenant/tenant.bootstrap';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    // Interceptor order matters: tenantInterceptor → authInterceptor → errorInterceptor.
    provideHttpClient(withInterceptors([tenantInterceptor, authInterceptor, errorInterceptor])),
    provideAppInitializer(tenantBootstrap()),
    // Icons used across layout/login/shared-ui. Add more as feature modules need them
    // (every `<tabler-icon name="x">` requires its IconX registered here, or it renders blank).
    provideTablerIcons({
      IconBuildingCommunity,
      IconUserCircle,
      IconLogout,
      IconEdit,
    }),
  ],
};
