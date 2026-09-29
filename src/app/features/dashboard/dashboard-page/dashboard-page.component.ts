import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { ApexOptions } from 'apexcharts';
import { TablerIconComponent } from 'angular-tabler-icons';
import { TenantStore } from '../../../core/tenant/tenant.store';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { SpinnerComponent } from '../../../shared/ui/spinner/spinner.component';
import { ChartDirective } from '../../../shared/ui/chart/chart.directive';
import {
  RequestStatus,
  STATUS_COLOR,
  STATUS_LABEL,
} from '../../requests/data-access/request.models';
import { STATUS_CHART_ORDER } from '../data-access/chart-theme';
import {
  backlogChart,
  byCategoryChart,
  byTowerChart,
  byTypeChart,
  monthlyFlowChart,
  TOP_BUCKETS,
} from '../data-access/chart-options';
import {
  addDays,
  containsDay,
  DateRange,
  DEFAULT_PRESET,
  formatDay,
  formatRange,
  instantToReportDay,
  isValidRange,
  presetRange,
  rangeLengthDays,
  todayInReportZone,
} from '../data-access/date-range';
import {
  computeDelta,
  Delta,
  deltaClass,
  deltaIcon,
  formatHours,
  formatNumber,
} from '../data-access/format';
import {
  clipMonthlyFlow,
  createdInRange,
  managedInRange,
} from '../data-access/request-report.models';
import { RequestReportService } from '../data-access/request-report.service';
import { RangePickerComponent } from '../range-picker/range-picker.component';

interface StatusTile {
  status: RequestStatus;
  label: string;
  color: string;
  count: number;
}

/**
 * Administrator landing: the whole PQRS report in one screen, for a date range.
 *
 * The single hard thing here is that the document mixes three time contracts
 * (ADR-0013): `statusToday` and `monthlyFlow` ignore the selected range, every
 * other block honours it. Each card therefore states its own scope in its
 * subtitle — without that, a "4 nuevas" tile next to a "0 creadas en el rango"
 * KPI reads as a bug rather than as two different questions.
 */
@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [
    PageHeaderComponent,
    RangePickerComponent,
    SpinnerComponent,
    EmptyStateComponent,
    ChartDirective,
    TablerIconComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard-page.component.html',
})
export class DashboardPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(RequestReportService);
  protected readonly tenant = inject(TenantStore);

  protected readonly report = this.service.report;
  protected readonly loading = this.service.loading;
  protected readonly error = this.service.error;

  protected readonly formatNumber = formatNumber;
  protected readonly formatHours = formatHours;
  protected readonly formatRange = formatRange;
  protected readonly deltaClass = deltaClass;
  protected readonly deltaIcon = deltaIcon;

  private readonly queryParams = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  /**
   * The range lives in the URL so it survives a refresh and can be shared.
   * A malformed or over-long pair silently falls back to the default preset
   * rather than bouncing a 400 off the API.
   *
   * The custom equality is what keeps the loading effect from re-firing on
   * every navigation that leaves `from`/`to` untouched.
   */
  protected readonly range = computed<DateRange>(
    () => {
      const params = this.queryParams();
      const candidate = { from: params.get('from') ?? '', to: params.get('to') ?? '' };
      return isValidRange(candidate) ? candidate : presetRange(DEFAULT_PRESET);
    },
    { equal: (a, b) => a.from === b.from && a.to === b.to },
  );

  protected readonly rangeLength = computed(() => rangeLengthDays(this.range()));

  /**
   * The previous period, for the comparison labels. `comparison.toUtc` is
   * EXCLUSIVE server-side (it equals the current `fromUtc`), so the inclusive
   * end shown to a human is the day before the current range starts.
   */
  protected readonly previousRange = computed<DateRange | null>(() => {
    const report = this.report();
    if (!report) return null;
    return {
      from: instantToReportDay(report.comparison.fromUtc),
      to: addDays(this.range().from, -1),
    };
  });

  constructor() {
    effect(() => this.service.load(this.range()));
  }

  protected onRangeChange(range: DateRange): void {
    // replaceUrl: flipping through presets should not fill the Back stack.
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { from: range.from, to: range.to },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected refresh(): void {
    this.service.load(this.range());
  }

  // ── Headline numbers ───────────────────────────────────────────────────────

  /** Live status counts — the whole tenant right now, NOT the selected range. */
  protected readonly statusTiles = computed<StatusTile[]>(() => {
    const report = this.report();
    if (!report) return [];

    const counts = new Map(report.statusToday.map((bucket) => [bucket.key, bucket.count]));
    return STATUS_CHART_ORDER.map((status) => ({
      status,
      label: STATUS_LABEL[status],
      color: STATUS_COLOR[status],
      count: counts.get(status) ?? 0,
    }));
  });

  protected readonly todayLabel = formatDay(todayInReportZone());

  /**
   * `statusToday` is a single snapshot of NOW — there is no per-day breakdown to
   * clip it with, so when the range does not reach today the only honest move is
   * to keep showing it and say that it is not the range's number.
   */
  protected readonly todayOutsideRange = computed(
    () => !containsDay(this.range(), todayInReportZone()),
  );

  /** Open work right now: everything that is neither resolved nor closed. */
  protected readonly openNow = computed(() =>
    this.statusTiles()
      .filter((tile) => tile.status === 'New' || tile.status === 'InProgress')
      .reduce((total, tile) => total + tile.count, 0),
  );

  protected readonly created = computed(() => {
    const report = this.report();
    return report ? createdInRange(report) : 0;
  });

  protected readonly managed = computed(() => {
    const report = this.report();
    return report ? managedInRange(report) : 0;
  });

  protected readonly createdDelta = computed<Delta>(() => {
    const report = this.report();
    return computeDelta(this.created(), report?.comparison.created ?? null);
  });

  protected readonly managedDelta = computed<Delta>(() => {
    const report = this.report();
    return computeDelta(this.managed(), report?.comparison.managed ?? null);
  });

  /** Faster resolution is better, so a rising median is painted as a regression. */
  protected readonly resolutionDelta = computed<Delta>(() => {
    const report = this.report();
    return computeDelta(
      report?.durations.resolutionMedianHours ?? null,
      report?.comparison.resolutionMedianHours ?? null,
      true,
    );
  });

  /**
   * Net flow over the range: positive means the queue grew faster than it was
   * worked down. Derived from the two range-scoped totals, not from
   * `monthlyFlow`, which answers a different (fixed 24-month) question.
   */
  protected readonly netInRange = computed(() => this.created() - this.managed());

  /** One-line reading of the net flow — the Balance card has no delta to show. */
  protected readonly netCaption = computed(() => {
    const net = this.netInRange();
    if (net > 0) return 'más entradas que salidas';
    if (net < 0) return 'más salidas que entradas';
    return 'entradas y salidas iguales';
  });

  // ── Charts ─────────────────────────────────────────────────────────────────

  /** The fixed 24-month series, narrowed to the months the range touches. */
  protected readonly monthlyWindow = computed(() =>
    clipMonthlyFlow(this.report()?.monthlyFlow ?? [], this.range()),
  );

  protected readonly monthlyFlowOptions = computed<ApexOptions>(() =>
    monthlyFlowChart(this.monthlyWindow().months),
  );

  protected readonly backlogOptions = computed<ApexOptions>(() =>
    backlogChart(this.report()?.backlogCurve ?? []),
  );

  protected readonly byTypeOptions = computed<ApexOptions>(() =>
    byTypeChart(this.report()?.byType ?? []),
  );

  protected readonly topCategories = computed(() =>
    (this.report()?.byCategory ?? []).slice(0, TOP_BUCKETS),
  );

  /** How many categories the top-N cut leaves out, so the card can say so. */
  protected readonly hiddenCategories = computed(() =>
    Math.max(0, (this.report()?.byCategory.length ?? 0) - TOP_BUCKETS),
  );

  protected readonly byCategoryOptions = computed<ApexOptions>(() =>
    byCategoryChart(this.topCategories()),
  );

  protected readonly byTower = computed(() => this.report()?.byTower ?? []);

  protected readonly byTowerOptions = computed<ApexOptions>(() =>
    byTowerChart(this.byTower().slice(0, TOP_BUCKETS)),
  );

  // ── Emptiness ──────────────────────────────────────────────────────────────

  /** Nothing was created in the range → every breakdown is empty by definition. */
  protected readonly hasCreated = computed(() => this.created() > 0);
  protected readonly hasBacklog = computed(() => (this.report()?.backlogCurve.length ?? 0) > 0);
  /** False when the range lands entirely outside the 24 months the API covers. */
  protected readonly hasMonthlyMonths = computed(() => this.monthlyWindow().months.length > 0);

  protected readonly hasMonthlyFlow = computed(() =>
    this.monthlyWindow().months.some((month) => month.created > 0 || month.managed > 0),
  );

  protected readonly backlogCoverage = computed(() => {
    const curve = this.report()?.backlogCurve ?? [];
    if (curve.length === 0) return null;
    return {
      days: curve.length,
      from: formatDay(curve[0].day),
      to: formatDay(curve[curve.length - 1].day),
    };
  });
}
