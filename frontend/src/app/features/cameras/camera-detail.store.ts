import { Injectable, inject, signal } from '@angular/core';
import { INCIDENT_REPOSITORY } from '../../core/config/injection-tokens';
import type { Detection } from '../../core/models/detection';
import type { NormalizedError } from '../../core/models/errors';
import { SentraHttpError } from '../../core/http/error.interceptor';

/** Detecciones por cámara vía D-5: incidents?cameraId → detections por incidente. */
@Injectable()
export class CameraDetailStore {
  private readonly incidents = inject(INCIDENT_REPOSITORY);

  private readonly _detections = signal<Detection[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<NormalizedError | null>(null);

  readonly detections = this._detections.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  async loadDetectionsForCamera(cameraId: string, workspaceId: string): Promise<void> {
    this._loading.set(true);
    this._error.set(null);
    try {
      const incidents = await this.incidents.list({ workspaceId, cameraId, limit: 25 });
      const pages = await Promise.all(
        incidents.items.map((inc) => this.incidents.listDetections(inc.id, undefined, 25)),
      );
      const all = pages.flatMap((p) => p.items);
      const byId = new Map(all.map((d) => [d.id, d]));
      this._detections.set(
        [...byId.values()].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
      );
    } catch (err) {
      this._error.set(
        err instanceof SentraHttpError
          ? err.normalized
          : {
              code: 'INTERNAL_ERROR',
              message: 'Error al cargar detecciones',
              requestId: 'client',
              httpStatus: 500,
            },
      );
    } finally {
      this._loading.set(false);
    }
  }
}
