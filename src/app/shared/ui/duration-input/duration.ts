/**
 * The arithmetic behind {@link DurationInputComponent}, kept apart from it so a
 * screen that only needs to SAY a duration — the resident's booking flow, which
 * reads the area's plazo out of the policy — imports the function and not the
 * control.
 */

/** What the number on screen is counted in. The stored value is always hours. */
export type DurationUnit = 'hours' | 'days';

export const HOURS_PER_DAY = 24;

/**
 * A plazo said the way it would be said out loud: `18` → `"18 horas"`, `48` →
 * `"2 días"`, `36` → `"1 día y 12 horas"`.
 *
 * Days take over past a day, because "36 horas" is arithmetic a resident has to
 * do while deciding whether to book. The leftover hours stay rather than being
 * rounded away: a plazo is a deadline, and rounding one in either direction
 * says something that is not true.
 */
export function formatHoursDuration(hours: number): string {
  const days = Math.floor(hours / HOURS_PER_DAY);
  const rest = hours % HOURS_PER_DAY;

  if (days === 0) return hoursLabel(rest);
  const daysLabel = days === 1 ? '1 día' : `${days} días`;
  return rest === 0 ? daysLabel : `${daysLabel} y ${hoursLabel(rest)}`;
}

function hoursLabel(hours: number): string {
  return hours === 1 ? '1 hora' : `${hours} horas`;
}
