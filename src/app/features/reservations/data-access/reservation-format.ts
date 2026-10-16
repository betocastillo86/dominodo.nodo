const COP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

const LONG_DATE = new Intl.DateTimeFormat('es-CO', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

export function formatCurrencyCOP(amount: number): string {
  return COP.format(amount);
}

/**
 * `"2026-10-20"` → `"martes, 20 de octubre"`.
 *
 * Built from the parts, never `new Date(iso)`: that parses a bare date as UTC
 * midnight, which in Colombia's -05:00 renders the PREVIOUS day.
 */
export function formatLongDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return LONG_DATE.format(new Date(year, month - 1, day));
}

/** `TimeOnly` as `"HH:mm:ss"` → a 12-hour Spanish label, e.g. `"8:00 a. m."`. */
export function formatTimeOfDay(time: string): string {
  const [hoursPart, minutesPart] = time.split(':');
  const hours = Number(hoursPart);
  const minutes = Number(minutesPart);
  const period = hours < 12 ? 'a. m.' : 'p. m.';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  const minuteLabel = minutes === 0 ? '' : `:${String(minutes).padStart(2, '0')}`;
  return `${hour12}${minuteLabel} ${period}`;
}
