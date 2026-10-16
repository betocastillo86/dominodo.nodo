import { HttpErrorResponse } from '@angular/common/http';
import { ProblemDetails } from '../../../core/http/problem-details';

export interface BookingFailure {
  /** Resident-facing Spanish copy. Never the API's own `detail`, which is English. */
  message: string;
  /** The calendar on screen is now stale — refetch before the resident retries. */
  staleAvailability: boolean;
}

/**
 * Error codes of `POST /reservations` (ADR-0018 §3) mapped to resident copy.
 *
 * The API puts the code in ProblemDetails' `title` and an English sentence in
 * `detail` (`ErrorResults.ToProblem`), so the code is what we switch on and the
 * `detail` is never shown — this audience is a resident on WhatsApp, not an
 * administrator.
 *
 * `staleAvailability` marks the failures that mean the calendar the resident is
 * looking at no longer matches the server: someone else took the slot, or the
 * window has since passed. ADR-0018 §8 guarantees these can happen on a slot
 * the calendar drew as free — availability is computed for the whole conjunto
 * and deliberately does NOT apply the per-apartment daily limit, so "disponible
 * no significa aceptado".
 */
const MESSAGES: Record<string, BookingFailure> = {
  'Reservation.SlotTaken': {
    message: 'Alguien acaba de reservar ese horario. Elige otro, por favor.',
    staleAvailability: true,
  },
  'Reservation.DayAlreadyBooked': {
    message: 'Esta área ya tiene una reserva ese día. Elige otro día.',
    staleAvailability: true,
  },
  'Reservation.StartInPast': {
    message: 'Ese horario ya pasó. Elige uno más adelante.',
    staleAvailability: true,
  },
  'Reservation.ApartmentDailyLimitReached': {
    message: 'Tu apartamento ya alcanzó el máximo de reservas de esta área para ese día.',
    staleAvailability: false,
  },
  'Reservation.ApartmentAmbiguous': {
    message:
      'Figuras como residente en más de un apartamento, así que no podemos saber a nombre de cuál reservar. Escríbele a la administración de tu conjunto.',
    staleAvailability: false,
  },
  'Reservation.NoResidency': {
    message: 'No figuras como residente activo de este conjunto, así que no puedes reservar.',
    staleAvailability: false,
  },
  'Reservation.NotAResident': {
    message: 'No figuras como residente activo de ese apartamento.',
    staleAvailability: false,
  },
  'Reservation.NotAMember': {
    message: 'Tu cuenta no está activa en este conjunto, así que no puedes reservar.',
    staleAvailability: false,
  },
  'Reservation.FeatureDisabled': {
    message: 'Este conjunto no tiene habilitadas las reservas de áreas sociales.',
    staleAvailability: false,
  },
  'Reservation.AmenityNotFound': {
    message: 'Esta área social ya no está disponible.',
    staleAvailability: false,
  },
  'Reservation.AmenityNotAvailable': {
    message: 'Esta área social está temporalmente fuera de servicio.',
    staleAvailability: false,
  },
  'Reservation.AttendeesExceedCapacity': {
    message: 'El número de asistentes supera el aforo del área.',
    staleAvailability: false,
  },
  'Reservation.AttendeesRequired': {
    message: 'Indica cuántas personas asistirán.',
    staleAvailability: false,
  },
};

/** Every window rule of the ladder lands on the same resident-facing sentence. */
const WINDOW_CODES = [
  'Reservation.WindowInvalid',
  'Reservation.StartNotOnTheHour',
  'Reservation.DurationNotWholeHours',
  'Reservation.DurationTooShort',
  'Reservation.DurationTooLong',
  'Reservation.CrossesMidnight',
  'Reservation.OutsideOpeningHours',
];

const WINDOW_FAILURE: BookingFailure = {
  message: 'Ese horario no cumple las reglas del área. Elige otro, por favor.',
  staleAvailability: true,
};

const UNEXPECTED: BookingFailure = {
  message: 'No pudimos crear tu reserva. Inténtalo de nuevo en un momento.',
  staleAvailability: false,
};

const OFFLINE: BookingFailure = {
  message: 'No pudimos conectarnos. Verifica tu conexión e inténtalo de nuevo.',
  staleAvailability: false,
};

export function toBookingFailure(error: unknown): BookingFailure {
  if (!(error instanceof HttpErrorResponse)) {
    return UNEXPECTED;
  }

  // No response at all (offline, DNS, a WebView that dropped the request).
  if (error.status === 0) {
    return OFFLINE;
  }

  const code = (error.error as ProblemDetails | undefined)?.title ?? '';

  if (WINDOW_CODES.includes(code)) {
    return WINDOW_FAILURE;
  }

  return MESSAGES[code] ?? UNEXPECTED;
}
