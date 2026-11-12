import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  input,
  output,
  viewChildren,
} from '@angular/core';
import { NgbDropdownModule } from '@ng-bootstrap/ng-bootstrap';
import { TablerIconComponent } from 'angular-tabler-icons';

const HOURS = Array.from({ length: 24 }, (_, i) => pad(i));
const MINUTES = Array.from({ length: 12 }, (_, i) => pad(i * 5));

/**
 * An `HH:mm` time field. Typing still goes through the native
 * `<input type="time">`, but its browser picker is replaced: Chrome's popup
 * has no visible scrollbar, so an administrator with a mouse without a wheel
 * could never reach the late hours. Ours is an ngb dropdown with two columns
 * (hours, minutes in 5-minute steps) that scroll with an always-visible bar.
 * Odd minutes stay reachable by typing.
 */
@Component({
  selector: 'app-time-input',
  standalone: true,
  imports: [NgbDropdownModule, TablerIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    /* Our dropdown replaces the browser picker (Chromium/WebKit only). */
    input[type='time']::-webkit-calendar-picker-indicator {
      display: none;
    }

    .time-picker {
      display: flex;
      gap: 0.25rem;
      padding: 0.25rem;
    }

    .time-column {
      max-height: 12rem;
      overflow-y: scroll;
      scrollbar-width: thin;
      padding-right: 0.25rem;
    }

    /* macOS hides overlay scrollbars until the wheel moves; force a small one. */
    .time-column::-webkit-scrollbar {
      width: 6px;
    }
    .time-column::-webkit-scrollbar-thumb {
      background: var(--tblr-border-color-dark, #c3c9d1);
      border-radius: 3px;
    }

    .time-option {
      display: block;
      width: 3rem;
      padding: 0.25rem 0.5rem;
      border: 0;
      border-radius: var(--tblr-border-radius);
      background: transparent;
      text-align: center;
      font-variant-numeric: tabular-nums;
    }
    .time-option:hover {
      background: var(--tblr-active-bg);
    }
    .time-option.active {
      background: var(--tblr-primary);
      color: var(--tblr-primary-fg, #fff);
    }
  `,
  template: `
    <div
      class="input-group"
      ngbDropdown
      container="body"
      placement="bottom-end"
      autoClose="outside"
      #dropdown="ngbDropdown"
      (openChange)="$event && scrollToSelected()"
    >
      <input
        type="time"
        class="form-control"
        [value]="value()"
        [disabled]="disabled()"
        [class.is-invalid]="invalid()"
        (change)="emit($any($event.target).value)"
        [attr.aria-label]="ariaLabel()"
      />
      <button
        type="button"
        class="btn btn-icon"
        ngbDropdownToggle
        [disabled]="disabled()"
        [class.is-invalid]="invalid()"
        [attr.aria-label]="'Elegir ' + (ariaLabel() || 'hora')"
      >
        <tabler-icon name="clock" />
      </button>

      <div ngbDropdownMenu class="p-0">
        <div class="time-picker">
          <div class="time-column" role="listbox" aria-label="Hora">
            @for (h of hours; track h) {
              <button
                #option
                type="button"
                class="time-option"
                role="option"
                [class.active]="h === hour()"
                [attr.aria-selected]="h === hour()"
                (click)="emit(h + ':' + (minute() || '00'))"
              >
                {{ h }}
              </button>
            }
          </div>
          <div class="time-column" role="listbox" aria-label="Minutos">
            @for (m of minutes; track m) {
              <button
                #option
                type="button"
                class="time-option"
                role="option"
                [class.active]="m === minute()"
                [attr.aria-selected]="m === minute()"
                (click)="emit((hour() || '00') + ':' + m); dropdown.close()"
              >
                {{ m }}
              </button>
            }
          </div>
        </div>
      </div>
    </div>
  `,
})
export class TimeInputComponent {
  /** `HH:mm`, or empty. */
  readonly value = input('');
  readonly disabled = input(false);
  readonly invalid = input(false);
  readonly ariaLabel = input('');

  /** Emits the new `HH:mm` whenever it is typed or picked. */
  readonly valueChange = output<string>();

  readonly hours = HOURS;
  readonly minutes = MINUTES;

  readonly hour = computed(() => this.value().slice(0, 2));
  readonly minute = computed(() => this.value().slice(3, 5));

  private readonly options = viewChildren<ElementRef<HTMLElement>>('option');

  emit(value: string): void {
    this.valueChange.emit(value);
  }

  /** Bring the current hour/minute into view inside each column, without scrolling the page. */
  scrollToSelected(): void {
    // The menu is attached to <body> on open; wait for it to lay out.
    setTimeout(() => {
      for (const { nativeElement: el } of this.options()) {
        if (!el.classList.contains('active')) continue;
        const column = el.parentElement!;
        column.scrollTop = el.offsetTop - column.offsetTop - column.clientHeight / 2 + el.clientHeight / 2;
      }
    });
  }
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
