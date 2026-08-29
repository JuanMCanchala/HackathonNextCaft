import { Injectable, computed, inject } from '@angular/core';
import { REALTIME_SERVICE } from '../config/injection-tokens';
import type { Camera } from '../models/camera';

/**
 * Facade leída por Dashboard / Cámaras / Incidentes.
 * Componentes no importan MockRealtimeService directamente (RF-RT-1).
 */
@Injectable({ providedIn: 'root' })
export class RealtimeStore {
  private readonly realtime = inject(REALTIME_SERVICE);

  readonly status = this.realtime.status();
  readonly liveIncidents = this.realtime.incidents();
  readonly liveCameras = this.realtime.cameras();
  readonly liveDetections = this.realtime.detections();

  /** REST/Convex + overlays live (misma lógica en dashboard y módulo cámaras). */
  mergeCameras(base: readonly Camera[]): Camera[] {
    const byId = new Map(base.map((c) => [c.id, c]));
    for (const cam of this.liveCameras()) {
      const existing = byId.get(cam.id);
      byId.set(cam.id, existing ? { ...existing, ...cam, label: existing.label } : cam);
    }
    return [...byId.values()];
  }

  readonly highlightedCameraIds = computed(() => {
    const ids = new Set<string>();
    for (const cam of this.liveCameras()) {
      if (cam.metadata && cam.metadata['highlighted'] === true) {
        ids.add(cam.id);
      }
    }
    for (const inc of this.liveIncidents()) {
      if (inc.state === 'detected') ids.add(inc.cameraId);
    }
    return ids;
  });

  readonly latestIncidentId = computed(() => this.liveIncidents()[0]?.id ?? null);

  isCameraHighlighted(cameraId: string): boolean {
    return this.highlightedCameraIds().has(cameraId);
  }
}
