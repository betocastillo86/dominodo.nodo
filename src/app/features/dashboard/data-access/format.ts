/** Number and duration formatting for the dashboard. Spanish conventions. */

const INTEGER = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const ONE_DECIMAL = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });

export function formatNumber(value: number): string {
  return INTEGER.format(value);
}

/**
 * A duration in hours, in the unit a human would use for its magnitude.
 * The API can report a null median when nothing was measured — that is an
 * absence, not a zero, and shows as an em dash.
 */
export function formatHours(hours: number | null | undefined): string {
  if (hours === null || hours === undefined) return '—';
  if (hours < 1) return `${INTEGER.format(Math.round(hours * 60))} min`;
  if (hours < 48) return `${ONE_DECIMAL.format(hours)} h`;
  return `${ONE_DECIMAL.format(hours / 24)} d`;
}

export type DeltaDirection = 'up' | 'down' | 'flat';

export interface Delta {
  direction: DeltaDirection;
  /** Absolute percentage change, or null when the baseline was zero. */
  percent: number | null;
  /** Ready-to-render text: `12 %`, `nuevo`, or `—`. */
  label: string;
  /** Whether this movement is a good thing, given the metric's polarity. */
  good: boolean;
}

/**
 * Compare a period against the previous one.
 *
 * `lowerIsBetter` flips only the JUDGEMENT, never the arrow: a rising median
 * resolution time still points up, it is just painted red instead of green.
 * A zero baseline has no meaningful percentage — going from 0 to 4 is not
 * "+400 %", so it is reported as `nuevo` rather than an invented number.
 */
export function computeDelta(
  current: number | null,
  previous: number | null,
  lowerIsBetter = false,
): Delta {
  if (current === null || previous === null) {
    return { direction: 'flat', percent: null, label: '—', good: false };
  }

  const difference = current - previous;
  const direction: DeltaDirection = difference > 0 ? 'up' : difference < 0 ? 'down' : 'flat';
  const good = direction === 'flat' ? true : (direction === 'up') !== lowerIsBetter;

  if (previous === 0) {
    return {
      direction,
      percent: null,
      label: current === 0 ? '—' : 'nuevo',
      good,
    };
  }

  const percent = (difference / previous) * 100;
  return {
    direction,
    percent: Math.abs(percent),
    label: `${ONE_DECIMAL.format(Math.abs(percent))} %`,
    good,
  };
}

/** Tabler text colour for a delta, neutral when there is nothing to compare. */
export function deltaClass(delta: Delta): string {
  if (delta.direction === 'flat' || delta.label === '—') return 'text-secondary';
  return delta.good ? 'text-green' : 'text-red';
}

/** Tabler icon name matching the delta's direction. */
export function deltaIcon(delta: Delta): string {
  if (delta.direction === 'up') return 'trending-up';
  if (delta.direction === 'down') return 'trending-down';
  return 'minus';
}
