import {
  ChangeDetectionStrategy,
  Component,
  forwardRef,
  input,
  signal,
} from '@angular/core';
import {
  ControlValueAccessor,
  FormControl,
  NG_VALUE_ACCESSOR,
  ReactiveFormsModule,
} from '@angular/forms';
import { NgbTypeahead, NgbTypeaheadSelectItemEvent } from '@ng-bootstrap/ng-bootstrap';
import { TablerIconComponent } from 'angular-tabler-icons';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  Observable,
  of,
  OperatorFunction,
  switchMap,
} from 'rxjs';

/** A single choice surfaced by the remote search. `value` is what the form stores. */
export interface SearchSelectOption {
  value: string;
  label: string;
  /** Optional muted second line (e.g. phone, tower). */
  sublabel?: string;
}

/** Signature for the remote search callback the host wires in. */
export type SearchSelectFn = (term: string) => Observable<SearchSelectOption[]>;

/**
 * Tabler-styled remote single-select ("typeahead"): the user types in the input,
 * a debounced async lookup runs, and inline suggestions drop under the field
 * (ng-bootstrap `NgbTypeahead`). Once picked, the input collapses into a
 * removable tag. Stores the chosen option's `value` via `ControlValueAccessor`,
 * so it binds to a `FormControl<string | null>` like any native control.
 *
 * Mirrors the resident autocomplete in `dominodo.admin`'s tenant form. Used by
 * the PQRS filter bar for the apartment and resident filters.
 */
@Component({
  selector: 'app-search-select',
  standalone: true,
  imports: [ReactiveFormsModule, NgbTypeahead, TablerIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SearchSelectComponent),
      multi: true,
    },
  ],
  template: `
    @if (selected(); as opt) {
      <div class="d-flex align-items-center gap-2 px-2 py-1 border rounded bg-secondary-lt">
        <div class="flex-fill text-truncate">
          <span class="fw-medium">{{ opt.label }}</span>
          @if (opt.sublabel) {
            <span class="text-secondary small ms-1">· {{ opt.sublabel }}</span>
          }
        </div>
        <button
          type="button"
          class="btn btn-icon btn-sm btn-ghost-secondary"
          [attr.aria-label]="clearLabel()"
          [disabled]="isDisabled()"
          (click)="clear()"
        >
          <tabler-icon name="x" />
        </button>
      </div>
    } @else {
      <input
        type="text"
        class="form-control"
        autocomplete="off"
        [placeholder]="placeholder()"
        [formControl]="query"
        [ngbTypeahead]="typeahead"
        [resultTemplate]="resultTemplate"
        [inputFormatter]="formatter"
        [editable]="false"
        (selectItem)="onSelect($event)"
      />
      <ng-template #resultTemplate let-opt="result">
        <div class="d-flex flex-column">
          <span>{{ opt.label }}</span>
          @if (opt.sublabel) {
            <small class="text-secondary">{{ opt.sublabel }}</small>
          }
        </div>
      </ng-template>
    }
  `,
})
export class SearchSelectComponent implements ControlValueAccessor {
  /** Remote lookup: called with the (trimmed) search term, returns matches. */
  readonly search = input.required<SearchSelectFn>();
  /** Placeholder shown in the search input while nothing is selected. */
  readonly placeholder = input('Buscar…');
  /** Minimum characters before the lookup runs. */
  readonly minChars = input(1);
  /** Debounce (ms) applied to keystrokes before the lookup runs. */
  readonly debounceMs = input(500);
  /** Accessible label for the remove ("x") button. */
  readonly clearLabel = input('Quitar filtro');

  protected readonly query = new FormControl<string | SearchSelectOption>('', {
    nonNullable: true,
  });
  protected readonly selected = signal<SearchSelectOption | null>(null);
  protected readonly isDisabled = signal(false);

  private onChange: (value: string | null) => void = () => {};
  private onTouched: () => void = () => {};

  /** ngbTypeahead operator: debounced, min-length-gated, error-safe remote lookup. */
  protected readonly typeahead: OperatorFunction<string, readonly SearchSelectOption[]> = (
    text$: Observable<string>,
  ) =>
    text$.pipe(
      debounceTime(this.debounceMs()),
      distinctUntilChanged(),
      switchMap((term) => {
        const q = (term ?? '').trim();
        if (q.length < this.minChars()) return of<SearchSelectOption[]>([]);
        return this.search()(q).pipe(catchError(() => of<SearchSelectOption[]>([])));
      }),
    );

  /** Renders the selected value / a highlighted result as its label. */
  protected readonly formatter = (opt: string | SearchSelectOption): string =>
    typeof opt === 'string' ? opt : opt.label;

  protected onSelect(event: NgbTypeaheadSelectItemEvent<SearchSelectOption>): void {
    // Keep the picked option out of the input; the tag view renders it instead.
    event.preventDefault();
    this.selected.set(event.item);
    this.onChange(event.item.value);
    this.onTouched();
  }

  protected clear(): void {
    this.selected.set(null);
    this.query.setValue('');
    this.onChange(null);
    this.onTouched();
  }

  writeValue(value: string | null): void {
    // Cleared externally (e.g. form.reset). We can't resolve a label for an
    // arbitrary incoming id, so only the "null" case is handled here — the
    // selected label is set locally in `onSelect()` when the user picks.
    if (!value) {
      this.selected.set(null);
      this.query.setValue('', { emitEvent: false });
    }
  }

  registerOnChange(fn: (value: string | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isDisabled.set(isDisabled);
    isDisabled ? this.query.disable({ emitEvent: false }) : this.query.enable({ emitEvent: false });
  }
}
