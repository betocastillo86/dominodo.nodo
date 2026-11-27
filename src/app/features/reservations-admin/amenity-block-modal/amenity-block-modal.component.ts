import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { finalize, Observable } from 'rxjs';
import { errorCode, toMessage } from '../../../core/http/problem-details';
import { TimeInputComponent } from '../../../shared/ui/time-input/time-input.component';
import { todayInReportZone } from '../../dashboard/data-access/date-range';
import { AmenityListItem } from '../../tenant-info/amenities/data-access/amenity.models';
import {
  AMENITY_BLOCK_NOTES_MAX_LENGTH,
  AMENITY_BLOCK_TITLE_MAX_LENGTH,
  AmenityBlockDto,
  AmenityBlockRequest,
  fromConjuntoInstant,
  toConjuntoInstant,
} from '../data-access/amenity-block.models';
import { AmenityBlocksService } from '../data-access/amenity-blocks.service';

const TIME = /^\d{2}:\d{2}$/;

/** Which control a domain error code points at, so it shows under that field. */
const CODE_TO_CONTROL: Record<string, string> = {
  'AmenityBlock.TitleRequired': 'title',
  'AmenityBlock.TitleTooLong': 'title',
  'AmenityBlock.NotesTooLong': 'notes',
  'AmenityBlock.AmenityRequired': 'amenityId',
  'Amenity.NotFound': 'amenityId',
};

/** The instant a filled-in `{day, time}` pair means, or null while either half is missing. */
function instantOf(group: AbstractControl, day: string, time: string): number | null {
  const dayValue = group.get(day)?.value as string;
  const timeValue = group.get(time)?.value as string;
  if (!dayValue || !TIME.test(timeValue ?? '')) return null;
  return new Date(toConjuntoInstant(dayValue, timeValue)).getTime();
}

/**
 * The API's two range rules (ADR-0031 §2), checked before the round trip:
 * the end comes after the start, and the end is still ahead. A start in the
 * past is fine — extending a block already under way is a legitimate edit.
 */
function rangeValidator(group: AbstractControl): ValidationErrors | null {
  const start = instantOf(group, 'startDay', 'startTime');
  const end = instantOf(group, 'endDay', 'endTime');
  if (start === null || end === null) return null;
  if (end <= start) return { rangeOrder: true };
  if (end <= Date.now()) return { endsInPast: true };
  return null;
}

/**
 * Creates or edits an administrative block of a social area (API ADR-0031):
 * a free range — it may span several days and ignores the area's opening
 * hours — during which nobody can book it.
 *
 * The opener calls {@link init} right after `open`; the modal closes with no
 * value once saved and is dismissed on cancel. Editing keeps the area: the
 * API's PUT cannot move a block to another area.
 */
@Component({
  selector: 'app-amenity-block-modal',
  standalone: true,
  imports: [ReactiveFormsModule, TimeInputComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './amenity-block-modal.component.html',
})
export class AmenityBlockModalComponent {
  readonly activeModal = inject(NgbActiveModal);
  private readonly service = inject(AmenityBlocksService);

  readonly areas = signal<AmenityListItem[]>([]);
  /** The block being edited, or null when creating one. */
  readonly block = signal<AmenityBlockDto | null>(null);

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly submitted = signal(false);

  readonly titleMaxLength = AMENITY_BLOCK_TITLE_MAX_LENGTH;
  readonly notesMaxLength = AMENITY_BLOCK_NOTES_MAX_LENGTH;
  readonly today = todayInReportZone();

  readonly form = new FormGroup(
    {
      amenityId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      startDay: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      startTime: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.pattern(TIME)],
      }),
      endDay: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      endTime: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.pattern(TIME)],
      }),
      title: new FormControl('', {
        nonNullable: true,
        validators: [
          Validators.required,
          Validators.maxLength(AMENITY_BLOCK_TITLE_MAX_LENGTH),
          Validators.pattern(/\S/),
        ],
      }),
      notes: new FormControl('', {
        nonNullable: true,
        validators: [Validators.maxLength(AMENITY_BLOCK_NOTES_MAX_LENGTH)],
      }),
    },
    { validators: rangeValidator },
  );

  /**
   * `areas` feeds the area select; `amenityId` preselects one (the list's
   * filter). With a `block`, the form starts from it and the area is fixed.
   */
  init(areas: AmenityListItem[], amenityId: string | null, block: AmenityBlockDto | null = null): void {
    this.areas.set(areas);
    this.block.set(block);

    if (block) {
      const start = fromConjuntoInstant(block.startsAtUtc);
      const end = fromConjuntoInstant(block.endsAtUtc);
      this.form.setValue({
        amenityId: block.amenityId,
        startDay: start.day,
        startTime: start.time,
        endDay: end.day,
        endTime: end.time,
        title: block.title,
        notes: block.notes ?? '',
      });
      this.form.controls.amenityId.disable();
    } else {
      // A whole-day default: the usual block is "the salón, all of the 24th".
      this.form.patchValue({
        amenityId: amenityId ?? '',
        startDay: this.today,
        startTime: '00:00',
        endDay: this.today,
        endTime: '23:59',
      });
    }
  }

  /** The time-input is not a form control; it reports through an output. */
  setTime(control: 'startTime' | 'endTime', value: string): void {
    this.form.controls[control].setValue(value);
    this.form.controls[control].markAsDirty();
  }

  /** Keeps the end from trailing the start when the start day moves past it. */
  onStartDayChange(): void {
    const { startDay, endDay } = this.form.controls;
    if (startDay.value && (!endDay.value || endDay.value < startDay.value)) {
      endDay.setValue(startDay.value);
    }
  }

  submit(): void {
    this.submitted.set(true);
    this.error.set(null);
    if (this.form.invalid) return;

    const raw = this.form.getRawValue();
    const body: AmenityBlockRequest = {
      startsAtUtc: toConjuntoInstant(raw.startDay, raw.startTime),
      endsAtUtc: toConjuntoInstant(raw.endDay, raw.endTime),
      title: raw.title.trim(),
      notes: raw.notes.trim() || null,
    };

    const block = this.block();
    const request: Observable<unknown> = block
      ? this.service.update(block.amenityId, block.id, body)
      : this.service.create(raw.amenityId, body);

    this.saving.set(true);
    request.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: () => this.activeModal.close(),
      error: (error: HttpErrorResponse) => this.onError(error),
    });
  }

  private onError(error: HttpErrorResponse): void {
    const message = toMessage(error);
    const target = CODE_TO_CONTROL[errorCode(error)];
    if (target) {
      this.form.get(target)?.setErrors({ server: message });
      return;
    }
    this.error.set(message);
  }
}
