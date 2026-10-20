import { HttpErrorResponse } from '@angular/common/http';
import { ProblemDetails } from '../../../core/http/problem-details';

/**
 * Error codes of the three state-change endpoints (`confirm`, `reject`,
 * `cancel`) mapped to administrator copy.
 *
 * Same reasoning as the resident side's `reservation-errors.ts`: the API puts
 * the CODE in ProblemDetails' `title` and an English sentence in `detail`, so
 * the code is what we switch on and the `detail` is never shown — UI copy is
 * Spanish.
 *
 * Most of these mean the row on screen is stale (someone else already acted, or
 * the window passed), which is why the caller reloads the page after showing
 * the message.
 */
const MESSAGES: Record<string, string> = {
  'Reservation.NotPending':
    'Esta reserva ya no está pendiente, así que no se puede confirmar ni rechazar. Actualiza el listado.',
  'Reservation.NotCancellable':
    'Solo se puede cancelar una reserva pendiente o confirmada. Actualiza el listado.',
  'Reservation.AlreadyStarted': 'La reserva ya empezó, así que no se puede cancelar.',
  'Reservation.CancellationWindowClosed':
    'Ya pasó el plazo de cancelación que exige el área para esta reserva.',
  'Reservation.ReasonRequired': 'Escribe el motivo.',
  'Reservation.ReasonTooLong': 'El motivo es demasiado largo.',
  'Reservation.NotFound': 'Esta reserva ya no existe.',
  'Reservation.Forbidden': 'No tienes permiso para cancelar esta reserva.',
};

const UNEXPECTED = 'No pudimos actualizar la reserva. Inténtalo de nuevo en un momento.';
const OFFLINE = 'No pudimos conectarnos. Verifica tu conexión e inténtalo de nuevo.';

export function toReservationActionMessage(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) return UNEXPECTED;
  if (error.status === 0) return OFFLINE;

  const problem = error.error as ProblemDetails | undefined;
  const mapped = MESSAGES[problem?.title ?? ''];
  if (mapped) return mapped;

  // Field-level validation still carries usable text; anything else is noise.
  if (problem?.errors?.length) return problem.errors.map((e) => e.message).join(' ');

  return UNEXPECTED;
}
