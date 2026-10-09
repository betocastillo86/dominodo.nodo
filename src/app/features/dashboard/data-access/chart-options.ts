import { ApexOptions } from 'apexcharts';
import {
  RequestStatus,
  RequestType,
  TYPE_LABEL,
} from '../../requests/data-access/request.models';
import {
  categoricalColors,
  cssVar,
  tablerColor,
  withChartTheme,
} from './chart-theme';
import { formatMonth } from './date-range';
import { formatNumber } from './format';
import {
  COMMON_AREAS_KEY,
  NO_TOWER_KEY,
  ReportBacklogPointDto,
  ReportBucketDto,
  ReportMonthDto,
} from './request-report.models';

/**
 * ApexCharts option factories for the dashboard, kept out of the component so
 * each one is a pure function of the data it draws — the component stays about
 * state, and these can be exercised against a real chart without Angular.
 */

/** Breakdown bars get crowded past this; the rest is reported as a footnote. */
export const TOP_BUCKETS = 8;

/** Created vs managed per month, with the net as a line on the same scale. */
export function monthlyFlowChart(months: readonly ReportMonthDto[]): ApexOptions {
  const colors = categoricalColors();

  return withChartTheme({
    chart: { type: 'line', height: 300, stacked: false },
    series: [
      { name: 'Creadas', type: 'column', data: months.map((month) => month.created) },
      { name: 'Gestionadas', type: 'column', data: months.map((month) => month.managed) },
      { name: 'Neto', type: 'line', data: months.map((month) => month.net) },
    ],
    colors: [colors[0], colors[1], tablerColor('orange', '#f76707')],
    stroke: { width: [0, 0, 2], curve: 'smooth' },
    plotOptions: { bar: { columnWidth: '65%', borderRadius: 2 } },
    markers: { size: 0, hover: { size: 4 } },
    xaxis: {
      categories: months.map((month) => formatMonth(month.year, month.month)),
      tickAmount: Math.min(months.length, 8),
      labels: { rotate: -45, rotateAlways: false, hideOverlappingLabels: true },
    },
    yaxis: { forceNiceScale: true },
    tooltip: { shared: true, intersect: false },
  });
}

/** `Resolved` and `Closed` both mean "already dealt with"; the curve adds them up. */
const HANDLED_STATUSES: readonly RequestStatus[] = ['Resolved', 'Closed'];

/**
 * Requests opened against requests already dealt with, at the close of each
 * consolidated day.
 *
 * Two cumulative curves, and the DISTANCE between them is the whole point: it
 * is the open backlog (`New` + `InProgress`) without ever drawing it. Curves
 * that converge mean the conjunto is catching up; a widening band means it is
 * falling behind.
 *
 * It used to draw one band per status, which no single axis could hold: on real
 * data `Closed` ran at 1428 while the three statuses that represent live
 * workload sat between 205 and 259, flattening them into a sliver at the foot
 * of the chart. Folding `Closed` into `Resolved` and leaving the rest implicit
 * puts both curves on the same order of magnitude.
 *
 * A DATETIME axis, not a category one: the snapshot job only covers days it has
 * already closed, so the series is legitimately sparse and evenly-spaced
 * categories would lie about where the gaps are.
 */
export function backlogChart(curve: readonly ReportBacklogPointDto[]): ApexOptions {
  return withChartTheme({
    chart: { type: 'area', height: 300, stacked: false },
    series: [
      {
        name: 'Resueltas',
        data: curve.map((point) => ({
          x: dayToTimestamp(point.day),
          y: countAtClose(point, HANDLED_STATUSES),
        })),
      },
      {
        name: 'Total',
        // A bare line rather than a second area, and drawn last so it sits over
        // the fill: what is left between the two is then visibly the pending
        // work, instead of reading as another quantity piled on top.
        type: 'line',
        data: curve.map((point) => ({
          x: dayToTimestamp(point.day),
          y: countAtClose(point),
        })),
      },
    ],
    // Green for what is done, neutral and theme-aware for the ceiling.
    colors: [tablerColor('green', '#2fb344'), cssVar('--tblr-body-color', '#1f2937')],
    stroke: { width: 2, curve: 'straight' },
    // Index 0 is the resolved area's fill. Index 1 is the total's STROKE
    // colour, and its 1 must not be "tidied" to 0: ApexCharts takes a
    // `type: 'line'` series' stroke from `fill`, not from `stroke` (`Line.js`:
    // `if (type === 'line') lineFill = fill.fillPath(...)`), so a 0 paints the
    // line transparent and leaves only its markers behind. It also fills
    // nothing — the area path is gated on `type === 'area'`.
    fill: { type: 'solid', opacity: [0.15, 1] },
    xaxis: {
      type: 'datetime',
      // The days are civil dates at the reporting offset, already baked into the
      // timestamp — reading them back as UTC is what keeps them stable.
      labels: { datetimeUTC: true, format: 'dd MMM' },
    },
    yaxis: { forceNiceScale: true },
    tooltip: { x: { format: 'dd MMM yyyy' }, shared: true },
  });
}

/**
 * Requests at the close of a photographed day, over every status or a subset.
 *
 * Summing buckets is exact rather than approximate: the API's
 * `ConsolidateDayAsync` counts every request created before the day's end and
 * folds a missing status history into `New`, so the buckets of a day that WAS
 * photographed are a complete and exclusive partition.
 */
function countAtClose(point: ReportBacklogPointDto, statuses?: readonly string[]): number {
  return point.byStatus
    .filter((bucket) => statuses === undefined || statuses.includes(bucket.key))
    .reduce((total, bucket) => total + bucket.count, 0);
}

/** PQRS mix for the range, with the total in the donut's hole. */
export function byTypeChart(buckets: readonly ReportBucketDto[]): ApexOptions {
  return withChartTheme({
    chart: { type: 'donut', height: 280 },
    series: buckets.map((bucket) => bucket.count),
    labels: buckets.map(typeLabel),
    colors: categoricalColors(),
    stroke: { width: 0 },
    plotOptions: {
      pie: {
        donut: {
          size: '70%',
          labels: {
            show: true,
            total: { show: true, label: 'Total', formatter: () => formatNumber(sum(buckets)) },
          },
        },
      },
    },
    legend: { position: 'bottom' },
    grid: { padding: { top: 0, right: 0, bottom: 0, left: 0 } },
  });
}

export function byCategoryChart(buckets: readonly ReportBucketDto[]): ApexOptions {
  return horizontalBars(
    buckets,
    (bucket) => bucket.label,
    () => cssVar('--tblr-primary', '#066fd1'),
  );
}

/**
 * Towers share one colour; the two buckets that are NOT a tower (common areas,
 * unknown tower) are greyed so they do not read as just another tower.
 */
export function byTowerChart(buckets: readonly ReportBucketDto[]): ApexOptions {
  return horizontalBars(
    buckets,
    (bucket) => bucket.label,
    (bucket) =>
      bucket.key === COMMON_AREAS_KEY || bucket.key === NO_TOWER_KEY
        ? cssVar('--tblr-secondary', '#6b7280')
        : tablerColor('teal', '#0ca678'),
  );
}

/** Shared ranked-breakdown chart: one bar per bucket, longest on top. */
function horizontalBars(
  buckets: readonly ReportBucketDto[],
  label: (bucket: ReportBucketDto) => string,
  color: (bucket: ReportBucketDto) => string,
): ApexOptions {
  // ApexCharts draws the first category at the TOP of a horizontal bar chart,
  // and the API already ranks these descending — so the order arrives ready to
  // plot. Reversing it here is what used to put the smallest bucket on top.
  const ordered = buckets;

  return withChartTheme({
    chart: { type: 'bar', height: Math.max(200, ordered.length * 34 + 56) },
    series: [{ name: 'Solicitudes', data: ordered.map((bucket) => bucket.count) }],
    colors: ordered.map(color),
    plotOptions: {
      bar: {
        horizontal: true,
        borderRadius: 3,
        // A conjunto with one tower would otherwise get a single slab filling
        // two thirds of the card; thin the bars out when there are few of them.
        barHeight: ordered.length <= 2 ? '28%' : '65%',
        distributed: true,
        // 'top' on a horizontal bar means the far end — the count then sits
        // past the bar instead of on top of a saturated fill it cannot be read
        // against.
        dataLabels: { position: 'top' },
      },
    },
    dataLabels: {
      enabled: true,
      offsetX: 18,
      style: { fontSize: '11px', colors: [cssVar('--tblr-body-color', '#1f2937')] },
      background: { enabled: false },
      textAnchor: 'start',
    },
    xaxis: { categories: ordered.map(label) },
    legend: { show: false },
    tooltip: { y: { title: { formatter: () => 'Solicitudes:' } } },
    // Right padding is what keeps the outside labels from being clipped.
    grid: { padding: { left: 8, right: 40 } },
  });
}

function sum(buckets: readonly ReportBucketDto[]): number {
  return buckets.reduce((total, bucket) => total + bucket.count, 0);
}

function typeLabel(bucket: ReportBucketDto): string {
  return TYPE_LABEL[bucket.key as RequestType] ?? bucket.label;
}

/** `yyyy-MM-dd` → the UTC-midnight timestamp Apex plots it at. */
function dayToTimestamp(day: string): number {
  const [year, month, date] = day.split('-').map(Number);
  return Date.UTC(year, month - 1, date);
}
