import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import {
  NgbDate,
  NgbDatepickerI18n,
  NgbDatepickerModule,
  NgbDateStruct,
  NgbDropdownModule,
} from '@ng-bootstrap/ng-bootstrap';
import { SpanishDatepickerI18n } from '../../../shared/ui/datepicker/spanish-datepicker-i18n';
import {
  DateRange,
  formatRange,
  MAX_RANGE_DAYS,
  matchPreset,
  RANGE_PRESETS,
  RangePresetKey,
  presetRange,
  rangeLengthDays,
  todayInReportZone,
} from '../data-access/date-range';

/**
 * Range selector for the dashboard: quick presets plus a two-month range
 * calendar for anything else. The presets cover what an administrator asks for
 * day to day; the calendar exists to audit one specific past month.
 *
 * The component owns only the DRAFT selection inside the calendar. The applied
 * range stays with the page (and the URL), which is why `range` is an input and
 * not internal state — a browser Back has to be able to repaint it.
 */
@Component({
  selector: 'app-range-picker',
  standalone: true,
  imports: [NgbDatepickerModule, NgbDropdownModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NgbDatepickerI18n, useClass: SpanishDatepickerI18n }],
  template: `
    <div class="d-flex flex-wrap align-items-center gap-2">
      <div class="btn-group" role="group" aria-label="Rango rápido">
        @for (preset of presets; track preset.key) {
          <button
            type="button"
            class="btn btn-sm"
            [class.btn-primary]="activePreset() === preset.key"
            [attr.aria-pressed]="activePreset() === preset.key"
            [disabled]="disabled()"
            (click)="applyPreset(preset.key)"
          >
            {{ preset.label }}
          </button>
        }
      </div>

      <div ngbDropdown container="body" autoClose="outside" #dropdown="ngbDropdown">
        <button
          type="button"
          class="btn btn-sm"
          [class.btn-primary]="activePreset() === null"
          [disabled]="disabled()"
          ngbDropdownToggle
          (click)="resetDraft()"
        >
          Personalizado
        </button>

        <div ngbDropdownMenu class="p-3 range-picker__menu">
          <ngb-datepicker
            [displayMonths]="displayMonths()"
            [dayTemplate]="dayTemplate"
            [maxDate]="maxDate"
            [startDate]="startDate()"
            navigation="arrows"
            outsideDays="hidden"
            (dateSelect)="onDateSelect($event)"
          />

          <ng-template #dayTemplate let-date let-focused="focused">
            <span
              class="range-picker__day"
              [class.range-picker__day--focused]="focused"
              [class.range-picker__day--edge]="isEdge(date)"
              [class.range-picker__day--inside]="isInside(date) || isPreview(date)"
              (mouseenter)="hovered.set(date)"
              (mouseleave)="hovered.set(null)"
            >
              {{ date.day }}
            </span>
          </ng-template>

          <div class="mt-3 d-flex align-items-center justify-content-between gap-3">
            <div class="small">
              @if (draftError(); as error) {
                <span class="text-red">{{ error }}</span>
              } @else if (draftRange(); as draft) {
                <span class="text-secondary">
                  {{ formatRange(draft) }} · {{ draftLength() }} días
                </span>
              } @else {
                <span class="text-secondary">Elige la fecha de inicio y la de fin.</span>
              }
            </div>
            <button
              type="button"
              class="btn btn-primary btn-sm"
              [disabled]="!draftRange() || !!draftError()"
              (click)="applyDraft(); dropdown.close()"
            >
              Aplicar
            </button>
          </div>
        </div>
      </div>

      <span class="text-secondary ms-1">{{ formatRange(range()) }}</span>
    </div>
  `,
  styles: [
    `
      .range-picker__menu {
        min-width: auto;
      }

      .range-picker__day {
        display: inline-block;
        width: 2rem;
        height: 2rem;
        line-height: 2rem;
        text-align: center;
        border-radius: var(--tblr-border-radius);
      }

      .range-picker__day:hover,
      .range-picker__day--focused {
        background-color: var(--tblr-bg-surface-secondary);
      }

      .range-picker__day--inside {
        background-color: rgba(var(--tblr-primary-rgb), 0.12);
        border-radius: 0;
      }

      .range-picker__day--edge,
      .range-picker__day--edge:hover {
        background-color: var(--tblr-primary);
        color: var(--tblr-primary-fg);
      }
    `,
  ],
})
export class RangePickerComponent {
  /** The range currently applied to the dashboard. */
  readonly range = input.required<DateRange>();
  readonly disabled = input(false);
  readonly rangeChange = output<DateRange>();

  protected readonly presets = RANGE_PRESETS;
  protected readonly formatRange = formatRange;

  /** No future days: the report has nothing to say about them. */
  protected readonly maxDate: NgbDateStruct = toNgbDate(todayInReportZone());

  /** One month on phones, two on anything wide enough to fit them. */
  protected readonly displayMonths = signal(window.innerWidth >= 768 ? 2 : 1);

  private readonly draftFrom = signal<NgbDate | null>(null);
  private readonly draftTo = signal<NgbDate | null>(null);
  protected readonly hovered = signal<NgbDate | null>(null);

  /** Which preset the applied range matches, or null when it is custom. */
  protected readonly activePreset = computed(() => matchPreset(this.range()));

  /** Open the calendar on the month the applied range starts in. */
  protected readonly startDate = computed(() => {
    const from = toNgbDate(this.range().from);
    return { year: from.year, month: from.month };
  });

  protected readonly draftRange = computed<DateRange | null>(() => {
    const from = this.draftFrom();
    const to = this.draftTo();
    if (!from || !to) return null;
    return { from: fromNgbDate(from), to: fromNgbDate(to) };
  });

  protected readonly draftLength = computed(() => {
    const draft = this.draftRange();
    return draft ? rangeLengthDays(draft) : 0;
  });

  /**
   * The server rejects anything over 366 days with a 400; catching it here turns
   * that into a disabled button and a sentence instead of a red toast.
   */
  protected readonly draftError = computed(() => {
    const draft = this.draftRange();
    if (!draft) return null;
    return rangeLengthDays(draft) > MAX_RANGE_DAYS
      ? `El rango no puede superar ${MAX_RANGE_DAYS} días.`
      : null;
  });

  protected applyPreset(key: RangePresetKey): void {
    this.rangeChange.emit(presetRange(key));
  }

  protected applyDraft(): void {
    const draft = this.draftRange();
    if (draft && !this.draftError()) {
      this.rangeChange.emit(draft);
    }
  }

  /** Seed the calendar with the applied range each time it is opened. */
  protected resetDraft(): void {
    const range = this.range();
    this.draftFrom.set(NgbDate.from(toNgbDate(range.from)));
    this.draftTo.set(NgbDate.from(toNgbDate(range.to)));
    this.hovered.set(null);
  }

  /**
   * Two-click range selection: the first click starts a new range, the second
   * closes it. Clicking before the start re-anchors instead of producing an
   * inverted range the user would have to undo.
   */
  protected onDateSelect(date: NgbDate): void {
    const from = this.draftFrom();
    const to = this.draftTo();

    if (!from || to) {
      this.draftFrom.set(date);
      this.draftTo.set(null);
    } else if (date.before(from)) {
      this.draftFrom.set(date);
    } else {
      this.draftTo.set(date);
    }
  }

  protected isEdge(date: NgbDate): boolean {
    return date.equals(this.draftFrom()) || date.equals(this.draftTo());
  }

  protected isInside(date: NgbDate): boolean {
    const from = this.draftFrom();
    const to = this.draftTo();
    return !!from && !!to && date.after(from) && date.before(to);
  }

  /** Shade the tentative range while the second click has not happened yet. */
  protected isPreview(date: NgbDate): boolean {
    const from = this.draftFrom();
    const hovered = this.hovered();
    return !!from && !this.draftTo() && !!hovered && date.after(from) && date.before(hovered);
  }
}

function toNgbDate(day: string): NgbDateStruct {
  const [year, month, date] = day.split('-').map(Number);
  return { year, month, day: date };
}

function fromNgbDate(date: NgbDateStruct): string {
  return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}
