import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { DurationUnit, HOURS_PER_DAY } from './duration';

/**
 * A duration typed in the unit the administrator thinks in, stored in the unit
 * the API speaks: the control's value is **always a number of hours** (or
 * `null` when the field is empty), so a parent binds it with a bare
 * `formControlName` and keeps its usual `Validators.min`/`max` in hours.
 *
 * The unit is a reinterpretation of the number, not a conversion of it: "7" +
 * "Días" is 168 hours, and switching the select to "Horas" means 7 hours. That
 * is what makes "una semana" a thing the administrator can type without doing
 * the arithmetic — and the equivalence hint under the field says out loud what
 * was stored, so the reinterpretation is never a surprise.
 *
 * Reading a value back picks the unit that reads best: a whole number of days
 * shows as days, anything else as hours.
 */
@Component({
  selector: 'app-duration-input',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => DurationInputComponent),
      multi: true,
    },
  ],
  template: `
    <div class="input-group">
      <input
        type="number"
        class="form-control"
        inputmode="numeric"
        min="1"
        [attr.id]="inputId() || null"
        [attr.max]="maxAmount()"
        [value]="amount() ?? ''"
        [disabled]="isDisabled()"
        [class.is-invalid]="invalid()"
        [attr.placeholder]="placeholder()"
        (input)="setAmount($event)"
        (blur)="touch()"
      />
      <select
        class="form-select flex-grow-0 w-auto"
        aria-label="Unidad de tiempo"
        [value]="unit()"
        [disabled]="isDisabled()"
        [class.is-invalid]="invalid()"
        (change)="setUnit($event)"
      >
        <option value="hours">Horas</option>
        <option value="days">Días</option>
      </select>
    </div>
    @if (equivalence(); as label) {
      <small class="form-hint">{{ label }}</small>
    }
  `,
})
export class DurationInputComponent implements ControlValueAccessor {
  /** `id` of the number input, so the parent's `<label for>` points at it. */
  readonly inputId = input('');
  readonly placeholder = input('');
  /** Upper bound IN HOURS; caps the number input in whatever unit is showing. */
  readonly maxHours = input<number | null>(null);
  /** Paints both halves of the group red — the parent owns the actual validator. */
  readonly invalid = input(false);

  protected readonly amount = signal<number | null>(null);
  protected readonly unit = signal<DurationUnit>('hours');
  protected readonly isDisabled = signal(false);

  protected readonly maxAmount = computed(() => {
    const max = this.maxHours();
    if (max == null) return null;
    return this.unit() === 'days' ? Math.floor(max / HOURS_PER_DAY) : max;
  });

  /** Only worth saying when the two units disagree — i.e. once days are chosen. */
  protected readonly equivalence = computed(() => {
    const hours = this.toHours();
    if (hours == null || this.unit() !== 'days') return null;
    return `Equivale a ${hours} ${hours === 1 ? 'hora' : 'horas'}.`;
  });

  private onChange: (value: number | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  protected setAmount(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    this.amount.set(raw === '' ? null : Number(raw));
    this.emit();
  }

  protected setUnit(event: Event): void {
    this.unit.set((event.target as HTMLSelectElement).value as DurationUnit);
    this.emit();
  }

  protected touch(): void {
    this.onTouched();
  }

  private toHours(): number | null {
    const amount = this.amount();
    if (amount == null || !Number.isFinite(amount)) return null;
    return this.unit() === 'days' ? amount * HOURS_PER_DAY : amount;
  }

  private emit(): void {
    this.onChange(this.toHours());
  }

  // ── ControlValueAccessor ────────────────────────────────────────────────
  writeValue(value: number | null): void {
    if (value == null || !Number.isFinite(value)) {
      this.amount.set(null);
      return;
    }
    if (value >= HOURS_PER_DAY && value % HOURS_PER_DAY === 0) {
      this.unit.set('days');
      this.amount.set(value / HOURS_PER_DAY);
      return;
    }
    this.unit.set('hours');
    this.amount.set(value);
  }

  registerOnChange(fn: (value: number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isDisabled.set(isDisabled);
  }
}
