import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { DashboardStore } from './dashboard.store';
import { KpiCardComponent } from '../../shared/ui/kpi-card.component';
import { CameraCardComponent } from '../../shared/ui/camera-card.component';
import { IncidentCardComponent } from '../../shared/ui/incident-card.component';
import { LoadingStateComponent } from '../../shared/ui/loading-state.component';
import { ErrorStateComponent } from '../../shared/ui/error-state.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  providers: [DashboardStore],
  imports: [
    KpiCardComponent,
    CameraCardComponent,
    IncidentCardComponent,
    LoadingStateComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    StatusBadgeComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-8">
      <div>
        <h1 class="font-display text-2xl text-[var(--sentra-text-hi)]">Vista general</h1>
        <p class="mt-1 text-sm text-[var(--sentra-text-mid)]">
          Stats últimas 24h · conectividad de cámaras · actividad reciente
        </p>
      </div>

      @if (store.loading()) {
        <app-loading-state />
      } @else if (store.error(); as err) {
        <app-error-state [error]="err" (retry)="store.load()" />
      } @else {
        @if (store.displayStats(); as stats) {
          <section aria-label="KPIs">
            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <app-kpi-card
                label="Detectados"
                [value]="stats.counts.incidentsByState.detected"
                hint="por estado · 24h (+ live)"
              />
              <app-kpi-card
                label="Críticos"
                [value]="stats.counts.incidentsBySeverity.critical"
                hint="por severidad · 24h"
                accent="var(--sentra-severity-critical)"
              />
              <app-kpi-card
                label="Cámaras online"
                [value]="stats.counts.camerasOnline + '/' + stats.counts.camerasTotal"
              />
              <app-kpi-card
                label="Detecciones"
                [value]="stats.counts.detectionsTotal"
                hint="total · 24h (+ live)"
              />
            </div>

            <div class="mt-4 flex flex-wrap gap-3 text-xs text-[var(--sentra-text-mid)]">
              @for (state of stateEntries(stats); track state[0]) {
                <span class="rounded border border-[var(--sentra-line)] px-2 py-1">
                  {{ state[0] }}: {{ state[1] }}
                </span>
              }
            </div>
          </section>
        }

        <section aria-label="Conectividad">
          <h2 class="mb-3 text-sm uppercase tracking-wide text-[var(--sentra-text-low)]">
            Cámaras
          </h2>
          <div class="mb-3 flex flex-wrap gap-2">
            @for (pair of connectivityEntries(); track pair[0]) {
              <div class="flex items-center gap-2 rounded border border-[var(--sentra-line)] px-2 py-1">
                <app-status-badge kind="connectivity" [value]="pair[0]" />
                <span class="font-mono text-xs">{{ pair[1] }}</span>
              </div>
            }
          </div>

          @if (store.empty()) {
            <app-empty-state title="Sin cámaras" description="No hay cámaras en este workspace." />
          } @else {
            <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              @for (cam of store.cameras(); track cam.id) {
                <app-camera-card
                  [camera]="cam"
                  [highlighted]="store.highlightedCameraIds().has(cam.id)"
                />
              }
            </div>
          }
        </section>

        <section aria-label="Actividad reciente">
          <h2 class="mb-3 text-sm uppercase tracking-wide text-[var(--sentra-text-low)]">
            Actividad reciente
          </h2>
          @if (store.recent().length === 0) {
            <app-empty-state title="Sin incidentes recientes" />
          } @else {
            <div class="grid gap-3 lg:grid-cols-2">
              @for (inc of store.recent(); track inc.id) {
                <app-incident-card [incident]="inc" />
              }
            </div>
          }
        </section>
      }
    </div>
  `,
})
export class DashboardPageComponent implements OnInit {
  readonly store = inject(DashboardStore);

  ngOnInit(): void {
    void this.store.load();
  }

  stateEntries(stats: NonNullable<ReturnType<DashboardStore['displayStats']>>) {
    return Object.entries(stats.counts.incidentsByState);
  }

  connectivityEntries() {
    return Object.entries(this.store.camerasByConnectivity()) as [
      'online' | 'offline' | 'degraded' | 'unknown',
      number,
    ][];
  }
}
