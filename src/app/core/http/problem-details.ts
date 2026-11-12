import { HttpErrorResponse } from '@angular/common/http';
import { isDevMode } from '@angular/core';
import { API_ERROR_MESSAGES } from './api-error-messages';
import { translateFieldError } from './validation-messages';

export { translateFieldError } from './validation-messages';

/**
 * RFC 9457 Problem Details, as returned by the API on error.
 * See docs/architecture.md §3.
 */
export interface ProblemDetails {
  type?: string;
  /** The API's error CODE (e.g. `Reservation.SlotTaken`), not prose. */
  title?: string;
  status?: number;
  /** English sentence for developers — never shown to the user. */
  detail?: string;
  /** Field-level validation errors, when present. */
  errors?: ProblemDetailError[];
}

export interface ProblemDetailError {
  property: string;
  message: string;
}

const OFFLINE = 'No pudimos conectarnos. Verifica tu conexión e inténtalo de nuevo.';

/** Last resort by HTTP status, for a code the catalog does not know (or no code at all). */
const BY_STATUS: Record<number, string> = {
  400: 'Algunos datos no son válidos. Revisa la información e inténtalo de nuevo.',
  401: 'Tu sesión no es válida. Inicia sesión nuevamente.',
  403: 'No tienes permiso para realizar esta acción.',
  404: 'No encontramos la información solicitada. Es posible que se haya eliminado.',
  409: 'No se pudo completar la acción porque la información cambió. Actualiza la página e inténtalo de nuevo.',
  413: 'El archivo es demasiado grande.',
  429: 'Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.',
};

const SERVER_ERROR = 'Ocurrió un error en el servidor. Inténtalo de nuevo en un momento.';
const UNEXPECTED = 'Ocurrió un error inesperado.';

/** The API's error code (ProblemDetails' `title`), or `''`. */
export function errorCode(error: HttpErrorResponse): string {
  return (error.error as ProblemDetails | null | undefined)?.title ?? '';
}

/**
 * The Spanish message the API's own payload supports: the translated field
 * errors of a `Validation.Failed`, or the catalog entry for its code
 * (`api-error-messages.ts`). `null` when there is neither — then the caller
 * picks its own fallback. Feature mappers with audience-specific copy call
 * this after their overrides.
 */
export function knownApiMessage(error: HttpErrorResponse): string | null {
  const problem = error.error as ProblemDetails | null | undefined;
  if (!problem || typeof problem !== 'object') {
    return null;
  }
  if (problem.errors?.length) {
    return problem.errors.map(translateFieldError).join(' ');
  }

  const code = problem.title ?? '';
  const entry = API_ERROR_MESSAGES[code];
  if (entry) {
    return typeof entry === 'function' ? entry(problem) : entry;
  }
  if (isDevMode() && /^[A-Za-z]+\.[A-Za-z]+$/.test(code)) {
    console.warn(`[api-errors] Unmapped API error code "${code}" — add it to api-error-messages.ts.`);
  }
  return null;
}

/**
 * The user-facing Spanish message for any failed API call. Shared by the error
 * interceptor (toast) and feature components (inline alerts). Never returns the
 * API's English `detail`.
 */
export function toMessage(error: HttpErrorResponse): string {
  if (error.status === 0) {
    return OFFLINE;
  }
  return knownApiMessage(error) ?? statusMessage(error.status);
}

function statusMessage(status: number): string {
  return BY_STATUS[status] ?? (status >= 500 ? SERVER_ERROR : UNEXPECTED);
}
