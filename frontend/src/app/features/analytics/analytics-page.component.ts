import { ChangeDetectionStrategy, Component, computed, inject, OnInit } from '@angular/core';
import { NgApexchartsModule } from 'ng-apexcharts';
import type { ApexChart, ApexDataLabels, ApexLegend, ApexPlotOptions, ApexXAxis } from 'ng-apexcharts';
import { StatsStore, type StatsPreset } from './stats.store';
import { KpiCardComponent } from '../../shared/ui/kpi-card.component';
import { LoadingStateComponent } from '../../shared/ui/loading-state.component';
import { ErrorStateComponent } from '../../shared/ui/error-state.component';
import {
  HlmButtonDirective,
  HlmCardComponent,
  HlmCardContentComponent,
  HlmCardHeaderComponent,
  HlmCardTitleComponent,
} from '../../shared/ui/primitives';

@Component({
  selector: 'app-analytics-page',
  standalone: true,
  providers: [StatsStore],
  imports: [
    NgApexchartsModule,
    KpiCardComponent,
    LoadingStateComponent,
    ErrorStateComponent,
    HlmButtonDirective,
    HlmCardComponent,
    HlmCardHeaderComponent,
    HlmCardTitleComponent,
    HlmCardContentComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 class="font-display text-2xl font-semibold tracking-tight text-foreground">Analítica</h1>
          <p class="mt-1 text-sm text-muted-foreground">
            KPIs derivados de incidentes (Convex MVP no expone GET /stats)
          </p>
        </div>
        <div class="flex gap-2">
          @for (p of presets; track p) {
            <button
              type="button"
              hlmBtn
              size="sm"
              [variant]="store.preset() === p ? 'default' : 'outline'"
              (click)="store.setPreset(p)"
            >
              {{ p }}
            </button>
          }
        </div>
      </div>

      @if (store.loading() && !store.stats()) {
        <app-loading-state />
      } @else if (store.error(); as err) {
        <app-error-state [error]="err" (retry)="store.load()" />
      } @else if (store.stats(); as stats) {
        <div class="grid gap-4 sm:grid-cols-3">
          <app-kpi-card label="Detecciones" [value]="stats.counts.detectionsTotal" />
          <app-kpi-card
            label="Cámaras online"
            [value]="stats.counts.camerasOnline + '/' + stats.counts.camerasTotal"
          />
          <app-kpi-card
            label="Rango"
            [value]="store.preset()"
            [hint]="stats.from.slice(0, 10) + ' → ' + stats.to.slice(0, 10)"
          />
        </div>

        <div class="grid gap-6 lg:grid-cols-2">
          <hlm-card class="p-4">
            <hlm-card-header class="p-0 pb-3">
              <hlm-card-title class="text-sm font-medium text-muted-foreground">
                Incidentes por estado
              </hlm-card-title>
            </hlm-card-header>
            <hlm-card-content class="p-0">
              <apx-chart
                [series]="stateSeries()"
                [chart]="barChart"
                [xaxis]="stateXaxis()"
                [plotOptions]="plotOptions"
                [dataLabels]="dataLabels"
                [colors]="['#22e0ff']"
              />
            </hlm-card-content>
          </hlm-card>
          <hlm-card class="p-4">
            <hlm-card-header class="p-0 pb-3">
              <hlm-card-title class="text-sm font-medium text-muted-foreground">
                Incidentes por severidad
              </hlm-card-title>
            </hlm-card-header>
            <hlm-card-content class="p-0">
              <apx-chart
                [series]="severitySeries()"
                [chart]="donutChart"
                [labels]="severityLabels"
                [legend]="legend"
                [colors]="severityColors"
              />
            </hlm-card-content>
          </hlm-card>
        </div>
      }
    </div>
  `,
})
export class AnalyticsPageComponent implements OnInit {
  readonly store = inject(StatsStore);
  readonly presets: StatsPreset[] = ['24h', '7d', '30d'];

  readonly barChart: ApexChart = {
    type: 'bar',
    height: 260,
    toolbar: { show: false },
    background: 'transparent',
    foreColor: '#a6b0c8',
  };
  readonly donutChart: ApexChart = {
    type: 'donut',
    height: 260,
    background: 'transparent',
    foreColor: '#a6b0c8',
  };
  readonly plotOptions: ApexPlotOptions = { bar: { borderRadius: 2, columnWidth: '45%' } };
  readonly dataLabels: ApexDataLabels = { enabled: false };
  readonly legend: ApexLegend = { position: 'bottom', labels: { colors: '#a6b0c8' } };
  readonly severityLabels = ['low', 'medium', 'high', 'critical'];
  readonly severityColors = ['#6b7a99', '#ffb020', '#ff8c42', '#ff4d5e'];

  readonly stateSeries = computed(() => {
    const s = this.store.stats()?.counts.incidentsByState;
    if (!s) return [{ name: 'Incidentes', data: [] as number[] }];
    return [
      {
        name: 'Incidentes',
        data: [s.detected, s.triaged, s.acknowledged, s.resolved, s.dismissed],
      },
    ];
  });

  readonly stateXaxis = computed((): ApexXAxis => ({
    categories: ['detected', 'triaged', 'acknowledged', 'resolved', 'dismissed'],
  }));

  readonly severitySeries = computed(() => {
    const s = this.store.stats()?.counts.incidentsBySeverity;
    if (!s) return [] as number[];
    return [s.low, s.medium, s.high, s.critical];
  });

  ngOnInit(): void {
    void this.store.load();
  }
}
