import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from '../header/header.component';
import { NavbarComponent } from '../navbar/navbar.component';

/**
 * Authenticated portal shell — Tabler HORIZONTAL top-navbar layout (not admin's
 * sidebar): branding header + nav menu above the routed content.
 */
@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, HeaderComponent, NavbarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <app-header />
      <app-navbar />
      <div class="page-wrapper">
        <div class="page-body">
          <div class="container-xl">
            <router-outlet />
          </div>
        </div>
      </div>
    </div>
  `,
})
export class ShellComponent {}
