import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';

/**
 * The small "?" badge that explains a figure in plain language.
 *
 * Tabler's own `.form-help` is the affordance (it already paints itself active
 * on `[aria-describedby]`, which is exactly what ng-bootstrap sets while the
 * tooltip is open). It is focusable on purpose: the tooltip opens on hover AND
 * on focus, so the explanation is reachable with a keyboard and by tapping on a
 * phone, where there is no hover at all.
 */
@Component({
  selector: 'app-help-hint',
  standalone: true,
  imports: [NgbTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="form-help"
      role="button"
      tabindex="0"
      [ngbTooltip]="text()"
      [attr.aria-label]="label()"
      container="body"
      >?</span
    >
  `,
})
export class HelpHintComponent {
  /** The explanation itself — business language, never field names. */
  readonly text = input.required<string>();
  /** What a screen reader announces before the explanation. */
  readonly label = input<string>('Qué significa este dato');
}
