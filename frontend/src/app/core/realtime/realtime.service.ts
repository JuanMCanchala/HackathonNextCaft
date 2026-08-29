import type { Signal } from '@angular/core';
import type { Camera } from '../models/camera';
import type { Detection } from '../models/detection';
import type { IncidentSummary } from '../models/incident';

export type RealtimeConnectionStatus = 'live' | 'connecting' | 'offline';

/**
 * Componentes solo conocen esta interfaz (RF-RT-1).
 * Swap MockRealtimeService ↔ ConvexRealtimeService = 1 línea de DI.
 */
export interface RealtimeService {
  connect(workspaceId: string): void;
  incidents(): Signal<readonly IncidentSummary[]>;
  cameras(): Signal<readonly Camera[]>;
  detections(): Signal<readonly Detection[]>;
  status(): Signal<RealtimeConnectionStatus>;
  disconnect(): void;
}
