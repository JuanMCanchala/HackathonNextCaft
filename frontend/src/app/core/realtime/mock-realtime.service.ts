import { Injectable, inject, signal } from '@angular/core';
import type { Camera } from '../models/camera';
import type { Detection } from '../models/detection';
import type { IncidentSummary } from '../models/incident';
import { cameraSchema, detectionSchema, incidentSummarySchema } from '../validation/schemas';
import { ToastService } from '../errors/toast.service';
import type { RealtimeConnectionStatus, RealtimeService } from './realtime.service';

const DEMO_CAMERAS = ['cam_entrada_principal', 'cam_pasillo_a', 'cam_almacen'] as const;
const DEMO_CATEGORIES = [
  'intrusion',
  'fall',
  'sin casco',
  'posible robo',
  'posible altercado',
] as const;

/**
 * Mock activo (RF-RT-2): setInterval simula Detection → Incident detected.
 * Valida con Zod (RF-RT-5); dedup por id (RF-RT-4).
 */
@Injectable()
export class MockRealtimeService implements RealtimeService {
  private readonly toast = inject(ToastService);

  private workspaceId: string | null = null;
  private tick = 0;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private connectTimeout: ReturnType<typeof setTimeout> | null = null;

  private readonly seenIncidentIds = new Set<string>();
  private readonly seenDetectionIds = new Set<string>();
  private readonly seenCameraIds = new Set<string>();

  private readonly _incidents = signal<readonly IncidentSummary[]>([]);
  private readonly _cameras = signal<readonly Camera[]>([]);
  private readonly _detections = signal<readonly Detection[]>([]);
  private readonly _status = signal<RealtimeConnectionStatus>('offline');

  connect(workspaceId: string): void {
    this.disconnect();
    this.workspaceId = workspaceId;
    this.tick = 0;
    this._status.set('connecting');

    this.connectTimeout = setTimeout(() => {
      this._status.set('live');
      this.emitDemoEvent();
      this.intervalId = setInterval(() => this.emitDemoEvent(), 18_000);
    }, 800);
  }

  incidents() {
    return this._incidents.asReadonly();
  }

  cameras() {
    return this._cameras.asReadonly();
  }

  detections() {
    return this._detections.asReadonly();
  }

  status() {
    return this._status.asReadonly();
  }

  disconnect(): void {
    if (this.intervalId) clearInterval(this.intervalId);
    if (this.connectTimeout) clearTimeout(this.connectTimeout);
    this.intervalId = null;
    this.connectTimeout = null;
    this.workspaceId = null;
    this._status.set('offline');
  }

  private emitDemoEvent(): void {
    const workspaceId = this.workspaceId;
    if (!workspaceId) return;

    this.tick += 1;
    const cameraId = DEMO_CAMERAS[this.tick % DEMO_CAMERAS.length];
    const category = DEMO_CATEGORIES[this.tick % DEMO_CATEGORIES.length];
    const now = new Date().toISOString();
    const suffix = `${Date.now()}_${this.tick}`;
    const detectionId = `det_rt_${suffix}`;
    const incidentId = `inc_rt_${suffix}`;

    const detectionRaw = {
      id: detectionId,
      workspaceId,
      cameraId,
      incidentId,
      occurredAt: now,
      receivedAt: now,
      category,
      suggestedCategory: category,
      confidence: 0.72 + (this.tick % 20) / 100,
      modelVersion: 'sentra-v1.2.0-mock',
      detectorVersion: 'det-rt-0.1.0',
      evidenceIds: [] as string[],
      metadata: { source: 'MockRealtimeService', tick: this.tick },
    };

    const incidentRaw = {
      id: incidentId,
      workspaceId,
      cameraId,
      category,
      state: 'detected' as const,
      severity: this.tick % 4 === 0 ? ('critical' as const) : ('high' as const),
      openedAt: now,
      lastObservedAt: now,
      assignedToSubjectId: null,
      version: 1,
    };

    const cameraRaw = {
      id: cameraId,
      workspaceId,
      externalId: `RT-${cameraId}`,
      label: `Live · ${cameraId}`,
      location: 'Realtime highlight',
      adminStatus: 'active' as const,
      connectivity: 'online' as const,
      lastHeartbeatAt: now,
      version: this.tick,
      createdAt: now,
      updatedAt: now,
      metadata: { highlighted: true, source: 'realtime' },
    };

    const detection = this.parseDetection(detectionRaw);
    const incident = this.parseIncident(incidentRaw);
    const camera = this.parseCamera(cameraRaw);

    if (!detection || !incident || !camera) {
      this.toast.showError({
        code: 'INTERNAL_ERROR',
        message: 'Payload realtime inválido',
        requestId: 'rt-parse',
        httpStatus: 500,
      });
      return;
    }

    this.mergeDetection(detection);
    this.mergeIncident(incident);
    this.mergeCamera(camera);

    this.toast.showInfo(`Nueva detección → incidente ${incident.state} · ${cameraId}`);
  }

  private parseDetection(raw: unknown): Detection | null {
    const result = detectionSchema.safeParse(raw);
    return result.success ? result.data : null;
  }

  private parseIncident(raw: unknown): IncidentSummary | null {
    const result = incidentSummarySchema.safeParse(raw);
    return result.success ? result.data : null;
  }

  private parseCamera(raw: unknown): Camera | null {
    const result = cameraSchema.safeParse(raw);
    return result.success ? result.data : null;
  }

  private mergeDetection(item: Detection): void {
    if (this.seenDetectionIds.has(item.id)) return;
    this.seenDetectionIds.add(item.id);
    this._detections.update((list) => [item, ...list].slice(0, 50));
  }

  private mergeIncident(item: IncidentSummary): void {
    if (this.seenIncidentIds.has(item.id)) return;
    this.seenIncidentIds.add(item.id);
    this._incidents.update((list) => [item, ...list].slice(0, 50));
  }

  private mergeCamera(item: Camera): void {
    // Dedup by id: replace existing or prepend (RF-RT-4)
    this._cameras.update((list) => {
      const idx = list.findIndex((c) => c.id === item.id);
      if (idx >= 0) {
        const next = [...list];
        next[idx] = item;
        return next;
      }
      this.seenCameraIds.add(item.id);
      return [item, ...list].slice(0, 20);
    });
  }
}
