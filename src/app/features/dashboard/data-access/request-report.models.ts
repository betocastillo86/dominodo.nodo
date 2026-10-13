import { coversWholeMonths, DateRange, monthIndex, monthIndexOf } from './date-range';

/**
 * Request report DTOs — typed EXACTLY as `dominodo.api` returns them (camelCase).
 * Verified against `RequestReportDto.cs` and `GetRequestReportQuery.cs`.
 *
 * Three temporal contracts coexist in one document and none of them is visible
 * from the shape (ADR-0013):
 *   - `statusToday`   → a photo of NOW, ignores the requested range.
 *   - `monthlyFlow`   → the last 24 local months, ignores the requested range.
 *   - everything else → honours the range, inclusive at both ends.
 * The UI has to label that difference, or the numbers read as contradictory.
 */

/** Generic `{key,label,count}` bucket the report uses for every breakdown. */
export interface ReportBucketDto {
  /** Stable key the client switches on (enum name, category id, tower name). */
  key: string;
  label: string;
  count: number;
}

export interface ReportMonthDto {
  year: number;
  /** 1-based, as the API sends it. */
  month: number;
  created: number;
  managed: number;
  /** Always `created - managed`; kept as sent rather than recomputed. */
  net: number;
}

export interface ReportDurationsDto {
  resolutionMedianHours: number | null;
  resolutionP90Hours: number | null;
  /**
   * Size of the sample the two percentiles above were computed from. It equals
   * `current.managed` by construction (same population), but it is a statistic's
   * footnote, not a headline figure — read the total from `current`.
   */
  resolutionSampleSize: number;
  firstResponseMedianHours: number | null;
  firstResponseP90Hours: number | null;
  firstResponseSampleSize: number;
}

/**
 * Totals of one window, with its own bounds. The document carries two of these
 * in the same shape — `current` (the requested range) and `comparison` (the
 * window of equal length immediately before it) — so the comparison reads
 * without the client deriving anything.
 */
export interface ReportPeriodDto {
  fromUtc: string;
  toUtc: string;
  created: number;
  managed: number;
  resolutionMedianHours: number | null;
}

export interface ReportBacklogPointDto {
  /** `DateOnly` on the wire → `yyyy-MM-dd`, never an instant. */
  day: string;
  /** SPARSE on purpose: a missing status means "not measured", not zero. */
  byStatus: ReportBucketDto[];
  /**
   * The day in progress, completed server-side from `statusToday` instead of
   * read from the nightly snapshot. At most one point carries it, always the
   * last, and only when today falls inside the range.
   */
  isLive: boolean;
}

/** Full document returned by `GET /requests/report`. */
export interface RequestReportDto {
  fromUtc: string;
  toUtc: string;
  statusToday: ReportBucketDto[];
  monthlyFlow: ReportMonthDto[];
  byCategory: ReportBucketDto[];
  byType: ReportBucketDto[];
  byTower: ReportBucketDto[];
  durations: ReportDurationsDto;
  /** Totals of the requested range — the headline figures, straight from the API. */
  current: ReportPeriodDto;
  comparison: ReportPeriodDto;
  backlogCurve: ReportBacklogPointDto[];
}

/** What `clipMonthlyFlow` had to bend to fit a fixed series into a range. */
export interface MonthlyWindow {
  months: readonly ReportMonthDto[];
  /** The range starts before the oldest month the series carries. */
  missingBefore: boolean;
  /** The range ends after the newest month the series carries. */
  missingAfter: boolean;
  /** The range does not start on a 1st and end on a month's last day. */
  partialEdges: boolean;
}

/**
 * Narrow the fixed 24-month series to the months a range touches.
 *
 * A month is the smallest slice this series has, so a month the range touches
 * even by one day comes in WHOLE — `partialEdges` is what tells the UI to say
 * so. And because nothing stops a hand-typed `?from=` two years back, the range
 * can reach past what the series carries at either end.
 */
export function clipMonthlyFlow(
  months: readonly ReportMonthDto[],
  range: DateRange,
): MonthlyWindow {
  if (months.length === 0) {
    return { months, missingBefore: false, missingAfter: false, partialEdges: false };
  }

  const first = months[0];
  const last = months[months.length - 1];
  const availableFrom = monthIndex(first.year, first.month);
  const availableTo = monthIndex(last.year, last.month);
  const wantedFrom = monthIndexOf(range.from);
  const wantedTo = monthIndexOf(range.to);

  return {
    months: months.filter((month) => {
      const index = monthIndex(month.year, month.month);
      return index >= wantedFrom && index <= wantedTo;
    }),
    missingBefore: wantedFrom < availableFrom,
    missingAfter: wantedTo > availableTo,
    partialEdges: !coversWholeMonths(range),
  };
}

/** The two by-tower buckets that are not a tower (keys fixed server-side). */
export const COMMON_AREAS_KEY = 'common-areas';
export const NO_TOWER_KEY = 'no-tower';
