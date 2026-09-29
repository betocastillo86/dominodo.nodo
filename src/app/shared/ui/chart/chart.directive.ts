import { Directive, effect, ElementRef, inject, input, OnDestroy } from '@angular/core';
import ApexCharts, { ApexOptions } from 'apexcharts';

/**
 * Mounts an ApexCharts instance on the host element and keeps it in sync with a
 * signal of options — the charting library Tabler itself uses, so the defaults
 * already look like the rest of the theme.
 *
 * Deliberately a directive and not a component: charts are laid out by their
 * Tabler card (`.chart-lg`, `.chart-sm`), and an extra wrapper element would
 * break the height rules those classes set.
 *
 *   <div class="chart-lg" [appChart]="backlogOptions()"></div>
 */
@Directive({
  selector: '[appChart]',
  standalone: true,
})
export class ChartDirective implements OnDestroy {
  readonly appChart = input.required<ApexOptions>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private chart: ApexCharts | null = null;
  private destroyed = false;

  /**
   * Every ApexCharts mutation is async and none of them is safe to interleave:
   * an `updateOptions` that starts before the initial `render()` resolves paints
   * an empty chart. Chaining them onto one promise serializes the lot, which
   * matters here because switching a preset re-emits options for six charts at
   * once while the previous render may still be in flight.
   */
  private queue: Promise<unknown> = Promise.resolve();

  constructor() {
    effect(() => {
      const options = this.appChart();
      this.queue = this.queue.then(() => this.apply(options)).catch(() => undefined);
    });
  }

  private apply(options: ApexOptions): Promise<unknown> | void {
    if (this.destroyed) return;

    if (!this.chart) {
      this.chart = new ApexCharts(this.host.nativeElement, options);
      return this.chart.render();
    }

    // redraw=false animates from the previous paths instead of flashing;
    // overwriteInitialConfig keeps the legend's own reset in step with reality.
    return this.chart.updateOptions(options, false, true, true, true);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.queue = this.queue
      .then(() => {
        this.chart?.destroy();
        this.chart = null;
      })
      .catch(() => undefined);
  }
}
