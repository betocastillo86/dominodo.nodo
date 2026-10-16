import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { buildMonthGrid } from './month-grid';

export interface DayAvailability {
  hasAvailability: boolean;
  hasOwnReservation: boolean;
}

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/**
 * Presentational Monday-first month grid for the reservation availability
 * screen (ADR-0018) — a plain CSS grid, not the FullCalendar widget, to keep
 * this screen free of a new JS dependency. Three visual states, composable
 * since a day can be both: a light green tint for an open day, a light blue
 * tint (which wins) for a day the resident already booked here, and the plain
 * background for a day with nothing free.
 */
@Component({
  selector: 'app-month-calendar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './month-calendar.component.html',
  styles: `
    .month-grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 0.25rem;
    }
    .day-cell {
      /* Square where there is room, but never under the 44px minimum touch
         target: at 360px the seven columns are ~35px wide, and a calendar you
         mis-tap is worse than one that scrolls. */
      aspect-ratio: 1;
      min-height: 2.75rem;
      border: 1px solid var(--tblr-border-color);
      border-radius: var(--tblr-border-radius);
      background: none;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      font-size: 1rem;
      /* No 300ms tap delay, no double-tap zoom on quick day taps. */
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
    }
    .day-cell:disabled {
      opacity: 0.35;
    }
    .day-cell:not(:disabled):active {
      filter: brightness(0.94);
    }
    /* Hover only where a pointer actually hovers — on touch it sticks after a tap. */
    @media (hover: hover) {
      .day-cell:not(:disabled):hover {
        filter: brightness(0.97);
      }
    }
  `,
})
export class MonthCalendarComponent {
  readonly year = input.required<number>();
  readonly month = input.required<number>();
  readonly dayAvailability = input<ReadonlyMap<string, DayAvailability>>(new Map());
  readonly selectedDate = input<string | null>(null);
  /** `yyyy-MM-dd`; days strictly before this are shown but not selectable. */
  readonly minDate = input<string | null>(null);

  readonly daySelected = output<string>();

  readonly weekdayLabels = WEEKDAY_LABELS;
  readonly weeks = computed(() => buildMonthGrid(this.year(), this.month()));

  isDisabled(date: string, inMonth: boolean): boolean {
    if (!inMonth) return true;
    const min = this.minDate();
    return min !== null && date < min;
  }

  select(date: string, inMonth: boolean): void {
    if (this.isDisabled(date, inMonth)) return;
    this.daySelected.emit(date);
  }
}
