/**
 * The arithmetic behind {@link DurationInputComponent}, kept apart from it so a
 * screen that only needs to SAY a duration — the resident's booking flow, which
 * reads the area's plazo out of the policy — imports the function and not the
 * control.
 */

/** What the number on screen is counted in. The stored value is always hours. */
export type DurationUnit = 'hours' | 'days';

export const HOURS_PER_DAY = 24;

/** `36` → `"36 horas"`, `168` → `"7 días"`. Whole days win whenever they divide. */
export function formatHoursDuration(hours: number): string {
  if (hours >= HOURS_PER_DAY && hours % HOURS_PER_DAY === 0) {
    const days = hours / HOURS_PER_DAY;
    return days === 1 ? '1 día' : `${days} días`;
  }
  return hours === 1 ? '1 hora' : `${hours} horas`;
}
