import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { BACKEND_CAPABILITIES } from '../../core/config/backend-capabilities';
import { DashboardStore } from './dashboard.store';
import { KpiCardComponent } from '../../shared/ui/kpi-card.component';
import { CameraCardComponent } from '../../shared/ui/camera-card.component';
import { IncidentCardComponent } from '../../shared/ui/incident-card.component';
import { LoadingStateComponent } from '../../shared/ui/loading-state.component';
import { ErrorStateComponent } from '../../shared/ui/error-state.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { HlmBadgeDirective } from '../../shared/ui/primitives';

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
    HlmBadgeDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-8">
      <div>
        <h1 class="font-display text-2xl font-semibold tracking-tight text-foreground">
          Vista general
        </h1>
        <p class="mt-1 text-sm text-muted-foreground">
          Resumen últimas 24h · cámaras · actividad reciente
        </p>
      </div>

      @if (store.loading()) {
        <app-loading-state />
      } @else if (store.error(); as err) {
        <app-error-state [error]="err" (retry)="store.load()" />
      } @else {
        @if (store.displayStats(); as stats) {
          <section aria-label="KPIs">
            <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-stretch">
              <app-kpi-card
                label="Detectados"
                [value]="stats.counts.incidentsByState.detected"
                hint="por estado · últimas 24h"
              />
              <app-kpi-card
                label="Críticos"
                [value]="stats.counts.incidentsBySeverity.critical"
                hint="por severidad · últimas 24h"
                accent="var(--sentra-severity-critical)"
              />
              <app-kpi-card
                [label]="caps.cameraConnectivity ? 'Cámaras online' : 'Cámaras registradas'"
                [value]="
                  caps.cameraConnectivity
                    ? stats.counts.camerasOnline + '/' + stats.counts.camerasTotal
                    : stats.counts.camerasTotal
                "
                [hint]="caps.cameraConnectivity ? 'conectividad · ahora' : 'en este workspace'"
              />
              <app-kpi-card
                label="Detecciones"
                [value]="stats.counts.detectionsTotal"
                hint="total · últimas 24h"
              />
            </div>

            <div class="mt-4 flex flex-wrap gap-2">
              @for (state of stateEntries(stats); track state[0]) {
                <span hlmBadge variant="outline" class="font-mono">
                  {{ state[0] }}: {{ state[1] }}
                </span>
              }
            </div>
          </section>
        }

        <section aria-label="Cámaras">
          <h2 class="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Cámaras
          </h2>
          @if (caps.cameraConnectivity) {
            <div class="mb-4 flex flex-wrap gap-2">
              @for (pair of connectivityEntries(); track pair[0]) {
                <div class="sentra-inset flex items-center gap-2 py-1.5">
                  <app-status-badge kind="connectivity" [value]="pair[0]" />
                  <span class="font-mono text-xs">{{ pair[1] }}</span>
                </div>
              }
            </div>
          }

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
          <h2 class="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
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
  readonly caps = inject(BACKEND_CAPABILITIES);

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
