import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  FormArray,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { TablerIconComponent } from 'angular-tabler-icons';
import { finalize } from 'rxjs';
import { toMessage } from '../../../core/http/problem-details';
import {
  ANNEX_LABEL_MAX_LENGTH,
  ANNEX_MAX_ITEMS,
  ANNEX_MODEL_MAX_LENGTH,
  ANNEX_PLATE_MAX_LENGTH,
  ApartmentAnnexesDto,
} from '../data-access/apartment.models';
import { ApartmentsService } from '../data-access/apartments.service';

/** `|` separates the API's search keys, so it is rejected in every annex value. */
const NO_SEPARATOR: ValidatorFn = (control) =>
  String(control.value ?? '').includes('|') ? { separator: true } : null;

/**
 * Blank as the API sees it: it normalizes by dropping spaces and hyphens, so a
 * value like "-" alone is rejected just like an empty one.
 */
const NOT_BLANK: ValidatorFn = (control) =>
  /[^\s-]/.test(String(control.value ?? '')) ? null : { required: true };

type VehicleGroup = FormGroup<{ plate: FormControl<string>; model: FormControl<string> }>;

/**
 * Edits an apartment's annexes (API ADR-0029 §1): its vehicles, parking spots
 * and storage units. Opened from the apartment detail; the opener calls `init`
 * through `componentInstance`. `PUT /apartments/{id}/annexes` is a full
 * replace, so the three lists are always sent as edited. Closes with no value
 * on success, and is dismissed on cancel.
 */
@Component({
  selector: 'app-apartment-annexes-modal',
  standalone: true,
  imports: [ReactiveFormsModule, TablerIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './apartment-annexes-modal.component.html',
})
export class ApartmentAnnexesModalComponent {
  readonly activeModal = inject(NgbActiveModal);
  private readonly service = inject(ApartmentsService);

  private apartmentId = '';

  readonly form = new FormGroup({
    vehicles: new FormArray<VehicleGroup>([]),
    parkingSpots: new FormArray<FormControl<string>>([]),
    storageUnits: new FormArray<FormControl<string>>([]),
  });

  readonly maxItems = ANNEX_MAX_ITEMS;
  readonly plateMaxLength = ANNEX_PLATE_MAX_LENGTH;
  readonly modelMaxLength = ANNEX_MODEL_MAX_LENGTH;
  readonly labelMaxLength = ANNEX_LABEL_MAX_LENGTH;

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly submitted = signal(false);

  /** Called by the opener right after `open`, with the annexes currently on screen. */
  init(apartmentId: string, annexes: ApartmentAnnexesDto): void {
    this.apartmentId = apartmentId;
    for (const vehicle of annexes.vehicles) this.addVehicle(vehicle.plate, vehicle.model ?? '');
    for (const spot of annexes.parkingSpots) this.addLabel(this.form.controls.parkingSpots, spot);
    for (const unit of annexes.storageUnits) this.addLabel(this.form.controls.storageUnits, unit);
  }

  addVehicle(plate = '', model = ''): void {
    this.form.controls.vehicles.push(
      new FormGroup({
        plate: new FormControl(plate, {
          nonNullable: true,
          validators: [
            NOT_BLANK,
            Validators.maxLength(ANNEX_PLATE_MAX_LENGTH),
            NO_SEPARATOR,
          ],
        }),
        model: new FormControl(model, {
          nonNullable: true,
          validators: [Validators.maxLength(ANNEX_MODEL_MAX_LENGTH), NO_SEPARATOR],
        }),
      }),
    );
  }

  addLabel(list: FormArray<FormControl<string>>, value = ''): void {
    list.push(
      new FormControl(value, {
        nonNullable: true,
        validators: [
          NOT_BLANK,
          Validators.maxLength(ANNEX_LABEL_MAX_LENGTH),
          NO_SEPARATOR,
        ],
      }),
    );
  }

  submit(): void {
    this.submitted.set(true);
    this.error.set(null);
    if (this.form.invalid) return;

    const raw = this.form.getRawValue();
    this.saving.set(true);
    this.service
      .updateAnnexes(this.apartmentId, {
        vehicles: raw.vehicles.map((v) => ({ plate: v.plate.trim(), model: v.model.trim() || null })),
        parkingSpots: raw.parkingSpots.map((s) => s.trim()),
        storageUnits: raw.storageUnits.map((u) => u.trim()),
      })
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => this.activeModal.close(),
        error: (error: HttpErrorResponse) => this.error.set(toMessage(error)),
      });
  }
}
