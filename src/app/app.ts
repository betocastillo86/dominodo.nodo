import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NotificationsComponent } from './shared/ui/notifications/notifications.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, NotificationsComponent],
  template: `
    <router-outlet />
    <app-notifications />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {}
