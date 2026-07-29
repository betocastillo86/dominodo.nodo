import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TablerIconComponent } from 'angular-tabler-icons';

/**
 * Tabler empty-state placeholder for lists/pages with no content. Optional
 * action slot projected via `[actions]`.
 */
@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [TablerIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="empty">
      @if (icon()) {
        <div class="empty-icon">
          <tabler-icon [name]="icon()!" />
        </div>
      }
      <p class="empty-title">{{ title() }}</p>
      @if (subtitle()) {
        <p class="empty-subtitle text-secondary">{{ subtitle() }}</p>
      }
      <div class="empty-action">
        <ng-content select="[actions]"></ng-content>
      </div>
    </div>
  `,
})
export class EmptyStateComponent {
  readonly title = input.required<string>();
  readonly subtitle = input<string>();
  /** Optional Tabler icon name shown above the title. */
  readonly icon = input<string | null>(null);
}
