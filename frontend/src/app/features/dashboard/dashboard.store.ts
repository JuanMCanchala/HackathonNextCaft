import { Injectable, computed, inject, signal } from '@angular/core';
import {
  CAMERA_REPOSITORY,
  INCIDENT_REPOSITORY,
  STATS_REPOSITORY,
} from '../../core/config/injection-tokens';
import { WorkspaceContextService } from '../../core/workspace/workspace-context.service';
import { RealtimeStore } from '../../core/realtime/realtime.store';
import type { Camera } from '../../core/models/camera';
import type { IncidentSummary } from '../../core/models/incident';
import type { StatsResponse } from '../../core/models/stats';
import type { NormalizedError } from '../../core/models/errors';
import { SentraHttpError } from '../../core/http/error.interceptor';

@Injectable()
export class DashboardStore {
  private readonly camerasRepo = inject(CAMERA_REPOSITORY);
  private readonly incidentsRepo = inject(INCIDENT_REPOSITORY);
  private readonly statsRepo = inject(STATS_REPOSITORY);
  private readonly workspace = inject(WorkspaceContextService);
  private readonly realtime = inject(RealtimeStore);

  private readonly _stats = signal<StatsResponse | null>(null);
  private readonly _cameras = signal<Camera[]>([]);
  private readonly _recent = signal<IncidentSummary[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<NormalizedError | null>(null);

  readonly stats = this._stats.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  /** REST cameras + live highlight overlays from realtime. */
  readonly cameras = computed(() => this.realtime.mergeCameras(this._cameras()));

  /** REST recent + live incidents, deduped by id (live first). */
  readonly recent = computed(() => {
    const live = this.realtime.liveIncidents();
    const rest = this._recent();
    const seen = new Set<string>();
    const merged: IncidentSummary[] = [];
    for (const item of [...live, ...rest]) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      merged.push(item);
    }
    return merged.slice(0, 12);
  });

  readonly empty = computed(
    () => !this._loading() && !this._error() && this.cameras().length === 0,
  );

  readonly camerasByConnectivity = computed(() => {
    const map = { online: 0, offline: 0, degraded: 0, unknown: 0 };
    for (const c of this.cameras()) {
      map[c.connectivity] += 1;
    }
    return map;
  });

  readonly highlightedCameraIds = this.realtime.highlightedCameraIds;

  /** Stats with live detected count bump for demo feedback. */
  readonly displayStats = computed(() => {
    const stats = this._stats();
    if (!stats) return null;
    const liveDetected = this.realtime.liveIncidents().filter((i) => i.state === 'detected').length;
    if (!liveDetected) return stats;
    return {
      ...stats,
      counts: {
        ...stats.counts,
        incidentsByState: {
          ...stats.counts.incidentsByState,
          detected: stats.counts.incidentsByState.detected + liveDetected,
        },
        detectionsTotal: stats.counts.detectionsTotal + this.realtime.liveDetections().length,
      },
    };
  });

  async load(): Promise<void> {
    const workspaceId = this.workspace.workspaceId();
    if (!workspaceId) return;

    this._loading.set(true);
    this._error.set(null);

    const to = new Date();
    const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);

    try {
      const [stats, camerasPage, incidentsPage] = await Promise.all([
        this.statsRepo.get(workspaceId, {
          from: from.toISOString(),
          to: to.toISOString(),
        }),
        this.camerasRepo.list({ workspaceId, limit: 50 }),
        this.incidentsRepo.list({ workspaceId, limit: 10 }),
      ]);

      this._stats.set(stats);
      this._cameras.set(camerasPage.items);
      this._recent.set(incidentsPage.items);
    } catch (err) {
      if (err instanceof SentraHttpError) {
        this._error.set(err.normalized);
      } else {
        this._error.set({
          code: 'INTERNAL_ERROR',
          message: 'No se pudo cargar el dashboard',
          requestId: 'client',
          httpStatus: 500,
        });
      }
    } finally {
      this._loading.set(false);
    }
  }
}
