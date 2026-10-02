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
  IconAddressBook,
  IconAlertTriangle,
  IconArchive,
  IconArrowLeft,
  IconArrowRight,
  IconBook,
  IconBuilding,
  IconBuildingCommunity,
  IconBuildingSkyscraper,
  IconCategory,
  IconChartArea,
  IconChartBar,
  IconChartDonut,
  IconCheck,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronUp,
  IconCopy,
  IconDashboard,
  IconDeviceFloppy,
  IconDownload,
  IconEdit,
  IconEye,
  IconFile,
  IconFilterOff,
  IconGripVertical,
  IconHistory,
  IconInfoCircle,
  IconLayoutColumns,
  IconList,
  IconListDetails,
  IconLock,
  IconLogout,
  IconMessage,
  IconMinus,
  IconPalette,
  IconPaperclip,
  IconPhone,
  IconPhoto,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSend,
  IconSpeakerphone,
  IconTrash,
  IconTrendingDown,
  IconTrendingUp,
  IconUpload,
  IconUser,
  IconUserCircle,
  IconUserMinus,
  IconUserPlus,
  IconUsers,
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
      // Requests (PQRS) module
      IconListDetails,
      IconList,
      IconLayoutColumns,
      IconSearch,
      IconFilterOff,
      IconGripVertical,
      // Request detail
      IconInfoCircle,
      IconMessage,
      IconPaperclip,
      IconFile,
      IconDownload,
      IconUsers,
      IconPhone,
      IconHistory,
      IconArrowRight,
      IconChevronLeft,
      IconChevronRight,
      // Apartments module
      IconBuilding,
      IconUserPlus,
      IconUserMinus,
      // Knowledge Resources module
      IconBook,
      // Mi Conjunto — tabs, schedule editor and branding
      IconAddressBook,
      IconPalette,
      IconPhoto,
      IconUpload,
      IconCheck,
      IconChevronDown,
      IconChevronUp,
      IconCopy,
      IconTrash,
      IconAlertTriangle,
      // Dashboard — nav, range picker, KPI deltas and chart empty states
      IconDashboard,
      IconTrendingUp,
      IconTrendingDown,
      IconMinus,
      IconChartBar,
      IconChartArea,
      IconChartDonut,
      IconCategory,
      IconBuildingSkyscraper,
      // New-version banner
      IconRefresh,
      // Mi perfil — header user menu + change-password action
      IconUser,
      IconLock,
    }),
  ],
};
