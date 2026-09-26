import { ApexLocale, ApexOptions } from 'apexcharts';
import { RequestStatus, STATUS_COLOR } from '../../requests/data-access/request.models';

/**
 * Shared ApexCharts styling, derived from Tabler's own CSS variables rather
 * than hard-coded hexes. Two things fall out of that for free: the tenant's
 * primary colour (painted onto `--tblr-primary` at bootstrap by
 * `applyTenantTheme`) reaches the charts, and Tabler's dark palette does too.
 */

/**
 * ApexCharts formats every datetime axis and tooltip through its own locale
 * table, which only ships English. Without this a backlog axis reads `01 Sep`
 * in an otherwise Spanish portal.
 */
const SPANISH_LOCALE: ApexLocale = {
  name: 'es',
  options: {
    months: [
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
    ],
    shortMonths: [
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
    ],
    days: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
    shortDays: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'],
  },
};

/** Read a Tabler CSS variable off the document root, resolved to a real value. */
export function cssVar(name: string, fallback: string): string {
  if (typeof getComputedStyle !== 'function') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/** A named Tabler palette colour (`azure`, `green`, …). */
export function tablerColor(name: string, fallback = '#6b7280'): string {
  return cssVar(`--tblr-${name}`, fallback);
}

function isDarkTheme(): boolean {
  return document.documentElement.getAttribute('data-bs-theme') === 'dark';
}

/** The lifecycle order every status chart renders in. */
export const STATUS_CHART_ORDER: readonly RequestStatus[] = [
  'New',
  'InProgress',
  'Resolved',
  'Closed',
];

/**
 * Status colours, reusing the exact map the PQRS list and board already use —
 * a resolved request is the same green everywhere in the portal.
 */
export function statusColors(): string[] {
  return STATUS_CHART_ORDER.map((status) => tablerColor(STATUS_COLOR[status]));
}

/**
 * Categorical palette for breakdowns with no intrinsic colour (type, category,
 * tower). Ordered for maximum separation between neighbours, since these render
 * as adjacent bars and slices.
 */
export function categoricalColors(): string[] {
  return [
    cssVar('--tblr-primary', '#066fd1'),
    tablerColor('teal', '#0ca678'),
    tablerColor('orange', '#f76707'),
    tablerColor('purple', '#ae3ec9'),
    tablerColor('lime', '#74b816'),
    tablerColor('pink', '#d6336c'),
    tablerColor('cyan', '#17a2b8'),
    tablerColor('indigo', '#4263eb'),
  ];
}

/** Plain-object deep merge, enough for the shallow nesting of Apex options. */
function merge<T>(base: T, override: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return (override === undefined ? base : override) as T;
  }

  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    result[key] = key in result ? merge(result[key], value) : value;
  }
  return result as T;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Apply the shared look to a chart's own options. Arrays (series, colours,
 * categories) always replace rather than merge — concatenating two series lists
 * is never what a caller means.
 */
export function withChartTheme(options: ApexOptions): ApexOptions {
  const muted = cssVar('--tblr-secondary', '#6b7280');
  const border = cssVar('--tblr-border-color', '#e5e7eb');
  const labelStyle = { colors: muted, fontSize: '11px' };

  const base: ApexOptions = {
    chart: {
      locales: [SPANISH_LOCALE],
      defaultLocale: 'es',
      fontFamily: 'inherit',
      toolbar: { show: false },
      zoom: { enabled: false },
      parentHeightOffset: 0,
      animations: { enabled: true, speed: 250 },
      background: 'transparent',
    },
    theme: { mode: isDarkTheme() ? 'dark' : 'light' },
    dataLabels: { enabled: false },
    grid: {
      borderColor: border,
      strokeDashArray: 4,
      xaxis: { lines: { show: false } },
      padding: { top: -8, right: 0, bottom: -4, left: 4 },
    },
    tooltip: {
      theme: isDarkTheme() ? 'dark' : 'light',
      style: { fontSize: '12px' },
    },
    legend: {
      show: true,
      position: 'bottom',
      horizontalAlign: 'center',
      fontSize: '12px',
      offsetY: 4,
      markers: { size: 6 },
      itemMargin: { horizontal: 8, vertical: 2 },
    },
    xaxis: {
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: { style: labelStyle },
      tooltip: { enabled: false },
    },
    yaxis: {
      labels: { style: labelStyle },
    },
    states: {
      hover: { filter: { type: 'lighten' } },
    },
  };

  return merge(base, options);
}
