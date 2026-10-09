import { ChangeDetectionStrategy, Component, forwardRef, input, signal } from '@angular/core';
import {
  AbstractControl,
  ControlValueAccessor,
  NG_VALIDATORS,
  NG_VALUE_ACCESSOR,
  ValidationErrors,
  Validator,
} from '@angular/forms';
import { TablerIconComponent } from 'angular-tabler-icons';
import { MAX_TOWER_LENGTH, MAX_TOWERS } from '../../../core/tenant/tenant-info.models';

/**
 * Editor for the conjunto's list of towers: type a name, add it, remove it.
 *
 * Speaks `string[]` through `ControlValueAccessor`, so a parent binds it with a
 * plain `formControlName`; turning that into the comma-separated text the API
 * stores is the caller's job (`formatTowers`). A comma is therefore rejected on
 * the way in — it is the separator, not a character a tower may carry.
 *
 * Rejections are shown as a hint next to the input instead of blocking the
 * form: nothing is wrong with the list, the admin just typed something that
 * cannot join it.
 */
@Component({
  selector: 'app-tower-editor',
  standalone: true,
  imports: [TablerIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tower-editor.component.html',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => TowerEditorComponent),
      multi: true,
    },
    {
      provide: NG_VALIDATORS,
      useExisting: forwardRef(() => TowerEditorComponent),
      multi: true,
    },
  ],
})
export class TowerEditorComponent implements ControlValueAccessor, Validator {
  readonly placeholder = input('Ej.: Torre 1');

  readonly towers = signal<readonly string[]>([]);
  readonly draft = signal('');
  readonly disabled = signal(false);
  /** Why the last attempt to add was refused. Cleared as soon as the text changes. */
  readonly rejection = signal<string | null>(null);

  readonly maxTowers = MAX_TOWERS;
  readonly maxTowerLength = MAX_TOWER_LENGTH;

  private onChange: (value: string[]) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  // ── ControlValueAccessor ────────────────────────────────────────────────
  writeValue(value: string[] | null): void {
    this.towers.set(value ?? []);
  }

  registerOnChange(fn: (value: string[]) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }

  // ── Validator ───────────────────────────────────────────────────────────
  /** Only the cap can be violated by the stored value; the rest is caught on entry. */
  validate(control: AbstractControl): ValidationErrors | null {
    const value = control.value as string[] | null;
    return (value?.length ?? 0) > MAX_TOWERS ? { maxTowers: true } : null;
  }

  // ── Editing ─────────────────────────────────────────────────────────────
  onDraftInput(value: string): void {
    this.draft.set(value);
    this.rejection.set(null);
  }

  /** Enter adds without submitting the surrounding form. */
  onDraftEnter(event: Event): void {
    event.preventDefault();
    this.add();
  }

  add(): void {
    if (this.disabled()) return;

    const tower = this.draft().trim();
    if (!tower) return;

    const rejection = this.reject(tower);
    if (rejection) {
      this.rejection.set(rejection);
      return;
    }

    this.commit([...this.towers(), tower]);
    this.draft.set('');
    this.rejection.set(null);
  }

  remove(index: number): void {
    if (this.disabled()) return;
    this.commit(this.towers().filter((_, i) => i !== index));
  }

  /** Null when the tower may join the list, otherwise the reason it may not. */
  private reject(tower: string): string | null {
    if (tower.includes(',')) {
      return 'El nombre de la torre no puede contener comas.';
    }
    if (tower.length > MAX_TOWER_LENGTH) {
      return `El nombre no puede superar los ${MAX_TOWER_LENGTH} caracteres.`;
    }
    // Case-insensitive, matching the server: "Torre A" and "torre a" are one tower.
    const key = tower.toLocaleLowerCase();
    if (this.towers().some((t) => t.toLocaleLowerCase() === key)) {
      return 'Esa torre ya está en la lista.';
    }
    if (this.towers().length >= MAX_TOWERS) {
      return `No puedes declarar más de ${MAX_TOWERS} torres.`;
    }
    return null;
  }

  private commit(towers: readonly string[]): void {
    this.towers.set(towers);
    this.onChange([...towers]);
    this.onTouched();
  }
}
