import {
  parseSchedule,
  ScheduleKey,
  serializeSchedule,
  TimeRange,
  WEEKDAYS,
  WeekdayKey,
  WeeklySchedule,
} from '../../../../shared/ui/schedule-editor/schedule.model';
import { AmenityOpeningHoursSlot, DayOfWeek } from './amenity.models';

/**
 * Adapters between the shared schedule editor and the Amenities contract.
 *
 * The editor speaks the JSON envelope `TenantSettings.Schedules` stores (one
 * string, days keyed `mon`…`sun` plus `hol`); `Amenity.OpeningHours` is instead
 * a flat list of `{ dayOfWeek, opensAt, closesAt }` keyed by the .NET
 * `DayOfWeek` enum (ADR-0016 §4). Two consequences, both deliberate:
 *
 * - **Holidays are dropped.** `DayOfWeek` has no holiday member, so the editor
 *   is mounted with `[allowHolidays]="false"` and that row never appears.
 * - **Seconds are added/removed.** `TimeOnly` serializes as `HH:mm:ss`, while
 *   `<input type="time">` and the envelope both work in `HH:mm`.
 */

/** Holidays are absent on purpose — hence `Partial`, not a total record. */
const DAY_OF_WEEK_BY_KEY: Partial<Record<ScheduleKey, DayOfWeek>> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

const KEY_BY_DAY_OF_WEEK: Record<DayOfWeek, WeekdayKey> = {
  Monday: 'mon',
  Tuesday: 'tue',
  Wednesday: 'wed',
  Thursday: 'thu',
  Friday: 'fri',
  Saturday: 'sat',
  Sunday: 'sun',
};

/** API slots → the editor's control value. `null` when there are no hours yet. */
export function slotsToScheduleValue(slots: readonly AmenityOpeningHoursSlot[]): string | null {
  if (!slots.length) return null;

  const schedule: WeeklySchedule = {};
  for (const slot of slots) {
    const key = KEY_BY_DAY_OF_WEEK[slot.dayOfWeek];
    const ranges = (schedule[key] ??= []);
    ranges.push({ from: toHoursMinutes(slot.opensAt), to: toHoursMinutes(slot.closesAt) });
  }

  // The API returns slots in insertion order; the editor reads top-to-bottom.
  for (const ranges of Object.values(schedule)) {
    ranges?.sort((a: TimeRange, b: TimeRange) => a.from.localeCompare(b.from));
  }

  return serializeSchedule(schedule);
}

/** The editor's control value → API slots. Anything unparseable means "no hours". */
export function scheduleValueToSlots(raw: string | null): AmenityOpeningHoursSlot[] {
  const schedule = parseSchedule(raw);
  if (!schedule) return [];

  const slots: AmenityOpeningHoursSlot[] = [];
  for (const entry of WEEKDAYS) {
    const dayOfWeek = DAY_OF_WEEK_BY_KEY[entry.key];
    if (!dayOfWeek) continue;

    for (const range of schedule[entry.key] ?? []) {
      slots.push({
        dayOfWeek,
        opensAt: `${range.from}:00`,
        closesAt: `${range.to}:00`,
      });
    }
  }

  return slots;
}

/** `"08:00:00"` → `"08:00"`. */
function toHoursMinutes(time: string): string {
  return time.slice(0, 5);
}
