import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NotificationService, NotificationType } from '../../../core/notifications/notification.service';

/**
 * Toast host — renders the NotificationService bus as stacked Tabler alerts,
 * fixed to the top-right. Mounted once in the root AppComponent.
 */
@Component({
  selector: 'app-notifications',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toast-container position-fixed top-0 end-0 p-3" style="z-index: 1090;">
      @for (n of notifications.items(); track n.id) {
        <div class="alert alert-{{ variant(n.type) }} alert-dismissible mb-2 shadow" role="alert">
          <div>{{ n.message }}</div>
          <button
            type="button"
            class="btn-close"
            aria-label="Cerrar"
            (click)="notifications.dismiss(n.id)"
          ></button>
        </div>
      }
    </div>
  `,
  // `.toast-container` ships `pointer-events: none` so it never blocks the page
  // behind it, and Tabler re-enables them on `.toast`. We stack `.alert`s instead,
  // which inherit `none` — that is what made the close button unclickable.
  styles: `
    .alert {
      pointer-events: auto;
    }
  `,
})
export class NotificationsComponent {
  protected readonly notifications = inject(NotificationService);

  protected variant(type: NotificationType): string {
    switch (type) {
      case 'error':
        return 'danger';
      case 'success':
        return 'success';
      default:
        return 'info';
    }
  }
}
