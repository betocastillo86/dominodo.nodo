import { HttpErrorResponse } from '@angular/common/http';

/**
 * RFC 9457 Problem Details, as returned by the API on error.
 * See docs/architecture.md §3.
 */
export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  /** Field-level validation errors, when present. */
  errors?: ProblemDetailError[];
}

export interface ProblemDetailError {
  property: string;
  message: string;
}

/**
 * Extract a human-facing message from a ProblemDetails payload.
 * Shared by the error interceptor and feature forms (for field-error mapping).
 */
export function toMessage(error: HttpErrorResponse): string {
  const problem = error.error as ProblemDetails | undefined;
  if (problem?.errors?.length) {
    return problem.errors.map((e) => e.message).join(' ');
  }
  return problem?.detail ?? problem?.title ?? 'Ocurrió un error inesperado.';
}
