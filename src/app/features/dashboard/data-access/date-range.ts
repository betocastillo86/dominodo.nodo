/**
 * Date-range arithmetic for the dashboard.
 *
 * The report cuts every day and month at a FIXED -05:00 offset server-side
 * (`ReportingTime.OffsetHours`), so a range picked here must be expressed in
 * that same zone — not in the browser's. A day is therefore carried around as a
 * plain `yyyy-MM-dd` civil date and only gains an instant when it is sent.
 */

/** Wire offset every report boundary is expressed in. Colombia has no DST. */
const REPORT_OFFSET = '-05:00';
const REPORT_OFFSET_MINUTES = -300;

const MS_PER_DAY = 86_400_000;

/** Server-side guard in `GetRequestReportQueryValidator` — mirrored here. */
export const MAX_RANGE_DAYS = 366;

/** An inclusive civil-date range, both ends `yyyy-MM-dd` in the report zone. */
export interface DateRange {
  from: string;
  to: string;
}

export type RangePresetKey = '7d' | '30d' | '90d' | 'month' | 'year';

export interface RangePreset {
  key: RangePresetKey;
  label: string;
}

export const RANGE_PRESETS: readonly RangePreset[] = [
  { key: '7d', label: '7 días' },
  { key: '30d', label: '30 días' },
  { key: '90d', label: '90 días' },
  { key: 'month', label: 'Este mes' },
  { key: 'year', label: 'Este año' },
];

export const DEFAULT_PRESET: RangePresetKey = '30d';

// ── Civil-date helpers ───────────────────────────────────────────────────────

/**
 * Today as the REPORT sees it. Shifting the epoch by the offset and then reading
 * the UTC components yields the wall clock at -05:00, whatever the browser's own
 * zone is — a device in Madrid and one in Bogotá agree on which day it is.
 */
export function todayInReportZone(): string {
  const shifted = new Date(Date.now() + REPORT_OFFSET_MINUTES * 60_000);
  return toIsoDay(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

function toIsoDay(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** `yyyy-MM-dd` → epoch ms at UTC midnight, the anchor all arithmetic uses. */
function dayToUtcMs(day: string): number {
  const [year, month, date] = day.split('-').map(Number);
  return Date.UTC(year, month - 1, date);
}

function utcMsToDay(ms: number): string {
  const date = new Date(ms);
  return toIsoDay(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function addDays(day: string, days: number): string {
  return utcMsToDay(dayToUtcMs(day) + days * MS_PER_DAY);
}

/** Whether a civil day falls inside an inclusive range. */
export function containsDay(range: DateRange, day: string): boolean {
  return dayToUtcMs(day) >= dayToUtcMs(range.from) && dayToUtcMs(day) <= dayToUtcMs(range.to);
}

/**
 * A month collapsed to a single comparable integer. Comparing `(year, month)`
 * pairs field by field is where off-by-one-year bugs live; this avoids it.
 */
export function monthIndex(year: number, month: number): number {
  return year * 12 + (month - 1);
}

/** The month a civil day belongs to, as a `monthIndex`. */
export function monthIndexOf(day: string): number {
  const [year, month] = day.split('-').map(Number);
  return monthIndex(year, month);
}

export function lastDayOfMonth(year: number, month: number): number {
  // Day 0 of the NEXT month is the last day of this one.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Whether a range starts on the 1st and ends on a month's last day. Monthly
 * series cannot be clipped mid-month, so anything else means the edge months
 * shown include days the range does not cover.
 */
export function coversWholeMonths(range: DateRange): boolean {
  const [toYear, toMonth, toDay] = range.to.split('-').map(Number);
  return range.from.endsWith('-01') && toDay === lastDayOfMonth(toYear, toMonth);
}

/** Inclusive length of a range, in days (`from === to` → 1). */
export function rangeLengthDays(range: DateRange): number {
  return Math.round((dayToUtcMs(range.to) - dayToUtcMs(range.from)) / MS_PER_DAY) + 1;
}

function isValidDay(day: string | null | undefined): day is string {
  return !!day && /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(dayToUtcMs(day));
}

/** A range is usable when it is ordered and within the server's 366-day guard. */
export function isValidRange(range: DateRange): boolean {
  if (!isValidDay(range.from) || !isValidDay(range.to)) return false;
  if (dayToUtcMs(range.from) > dayToUtcMs(range.to)) return false;
  return rangeLengthDays(range) <= MAX_RANGE_DAYS;
}

// ── Presets ──────────────────────────────────────────────────────────────────

/**
 * Resolve a preset against today. The rolling presets INCLUDE today, so "7 días"
 * is today plus the six before it — not the seven before today.
 */
export function presetRange(key: RangePresetKey, today = todayInReportZone()): DateRange {
  const [year, month] = today.split('-').map(Number);

  switch (key) {
    case '7d':
      return { from: addDays(today, -6), to: today };
    case '30d':
      return { from: addDays(today, -29), to: today };
    case '90d':
      return { from: addDays(today, -89), to: today };
    case 'month':
      return { from: toIsoDay(year, month, 1), to: today };
    case 'year':
      return { from: toIsoDay(year, 1, 1), to: today };
  }
}

/** Which preset a range corresponds to, or null when it is a custom one. */
export function matchPreset(range: DateRange, today = todayInReportZone()): RangePresetKey | null {
  const match = RANGE_PRESETS.find((preset) => {
    const candidate = presetRange(preset.key, today);
    return candidate.from === range.from && candidate.to === range.to;
  });
  return match?.key ?? null;
}

// ── Wire format ──────────────────────────────────────────────────────────────

/**
 * Start of the range as an instant: local midnight at the reporting offset.
 * The offset is written literally (`-05:00`) rather than derived from the
 * browser, so the boundary lands exactly where the SQL cuts it.
 */
export function toFromUtc(day: string): string {
  return `${day}T00:00:00.000${REPORT_OFFSET}`;
}

/**
 * End of the range. The API filters `<= toUtc` (inclusive), so the last
 * millisecond of the day is what makes `to` cover the whole day.
 */
export function toToUtc(day: string): string {
  return `${day}T23:59:59.999${REPORT_OFFSET}`;
}

// ── Display ──────────────────────────────────────────────────────────────────

const MONTHS_SHORT = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

const MONTHS_LONG = [
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

/** `2026-09-25` → `25 sep 2026`. Never goes through `Date` parsing of the string. */
export function formatDay(day: string, withYear = true): string {
  const [year, month, date] = day.split('-').map(Number);
  const base = `${date} ${MONTHS_SHORT[month - 1]}`;
  return withYear ? `${base} ${year}` : base;
}

/** `1 sep — 25 sep 2026`, collapsing the year when both ends share it. */
export function formatRange(range: DateRange): string {
  const sameYear = range.from.slice(0, 4) === range.to.slice(0, 4);
  return `${formatDay(range.from, !sameYear)} — ${formatDay(range.to)}`;
}

/** `2026-09` → `sep 2026`, for the monthly-flow axis. */
export function formatMonth(year: number, month: number, short = true): string {
  const names = short ? MONTHS_SHORT : MONTHS_LONG;
  return `${names[month - 1]} ${year}`;
}

/** An instant from the API (`comparison.fromUtc`) back to a report-zone day. */
export function instantToReportDay(instant: string): string {
  const shifted = new Date(new Date(instant).getTime() + REPORT_OFFSET_MINUTES * 60_000);
  return toIsoDay(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}
