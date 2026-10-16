export interface MonthGridDay {
  /** `yyyy-MM-dd`, a plain calendar day — never shifted for the browser's timezone. */
  date: string;
  dayNumber: number;
  /** `false` for the leading/trailing days of the adjacent months used to pad full weeks. */
  inMonth: boolean;
}

/** `yyyy-MM-dd` for the given (possibly out-of-range) year/month/day — JS `Date` rolls overflow correctly. */
export function toIsoDate(year: number, month: number, day: number): string {
  const date = new Date(year, month - 1, day);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Last day-of-month number for the given (possibly out-of-range) year/month. */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Monday-first week grid for the given month (1-12), padded with the
 * adjacent months' days so every row is a full week. Row count follows the
 * month (5 or 6), never padded to a fixed 6 — a trailing empty week reads as
 * a layout bug, not a calendar.
 */
export function buildMonthGrid(year: number, month: number): MonthGridDay[][] {
  const total = daysInMonth(year, month);
  const firstWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7; // Monday = 0

  const cells: MonthGridDay[] = [];

  const prevMonthDays = daysInMonth(year, month - 1);
  for (let i = firstWeekday - 1; i >= 0; i--) {
    const dayNumber = prevMonthDays - i;
    cells.push({ date: toIsoDate(year, month - 1, dayNumber), dayNumber, inMonth: false });
  }

  for (let day = 1; day <= total; day++) {
    cells.push({ date: toIsoDate(year, month, day), dayNumber: day, inMonth: true });
  }

  for (let day = 1; cells.length % 7 !== 0; day++) {
    cells.push({ date: toIsoDate(year, month + 1, day), dayNumber: day, inMonth: false });
  }

  const weeks: MonthGridDay[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

export const MONTH_NAMES_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];
