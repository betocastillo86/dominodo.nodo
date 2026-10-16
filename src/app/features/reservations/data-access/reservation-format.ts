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

/**
 * Pinned to the conjunto's clock, not the device's: the API computes every
 * local time against a fixed `-05:00` (`ReportingTime`), and a resident reading
 * a deadline from another timezone must still see the conjunto's hour.
 */
const LONG_DATE_TIME = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'long',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'America/Bogota',
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

/**
 * A UTC instant (`DateTimeOffset` as ISO-8601) → `"20 de octubre, 8:00 p. m."`
 * in the conjunto's time. Unlike `formatLongDate`, parsing with `new Date` is
 * correct here: the string carries its own offset, so there is no day to shift.
 */
export function formatInstant(iso: string): string {
  return LONG_DATE_TIME.format(new Date(iso));
}

/**
 * The conjunto's wall clock for an instant, rendered in the SAME style as the
 * calendar's slots (`formatTimeOfDay`) so a booked window reads identically
 * before and after it is confirmed.
 */
const BOGOTA_HOUR_MINUTE = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  // `hourCycle` alone, never alongside `hour12`: that pair makes the spec drop
  // the cycle, and some engines then render midnight as "24:00", which
  // `formatTimeOfDay` would read as 12 p. m.
  hourCycle: 'h23',
  timeZone: 'America/Bogota',
});

export function formatInstantAsTimeOfDay(iso: string): string {
  return formatTimeOfDay(BOGOTA_HOUR_MINUTE.format(new Date(iso)));
}

