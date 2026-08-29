import { Injectable, signal } from '@angular/core';
import type { Camera } from '../models/camera';
import type { Detection } from '../models/detection';
import type { IncidentSummary } from '../models/incident';
import type { RealtimeConnectionStatus, RealtimeService } from './realtime.service';

/** Placeholder hasta deployment Convex (D-4 / RF-RT-3). */
@Injectable()
export class ConvexRealtimeService implements RealtimeService {
  private readonly _incidents = signal<readonly IncidentSummary[]>([]);
  private readonly _cameras = signal<readonly Camera[]>([]);
  private readonly _detections = signal<readonly Detection[]>([]);
  private readonly _status = signal<RealtimeConnectionStatus>('offline');

  connect(_workspaceId: string): void {
    this._status.set('offline');
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
    this._status.set('offline');
  }
}
