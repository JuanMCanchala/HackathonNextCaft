import { InjectionToken } from '@angular/core';
import type { AuthService } from '../auth/auth.service';
import type { RealtimeService } from '../realtime/realtime.service';
import type { CameraRepository } from '../../data/repositories/camera.repository';
import type { DetectionRepository } from '../../data/repositories/detection.repository';
import type { EvidenceRepository } from '../../data/repositories/evidence.repository';
import type { IncidentRepository } from '../../data/repositories/incident.repository';
import type { StatsRepository } from '../../data/repositories/stats.repository';
import type { WorkspaceRepository } from '../../data/repositories/workspace.repository';

export const SENTRA_API_BASE = new InjectionToken<string>('SENTRA_API_BASE');
export const SENTRA_CONVEX_URL = new InjectionToken<string>('SENTRA_CONVEX_URL');

export const AUTH_SERVICE = new InjectionToken<AuthService>('AuthService');
export const REALTIME_SERVICE = new InjectionToken<RealtimeService>('RealtimeService');

export const WORKSPACE_REPOSITORY = new InjectionToken<WorkspaceRepository>('WorkspaceRepository');
export const CAMERA_REPOSITORY = new InjectionToken<CameraRepository>('CameraRepository');
export const INCIDENT_REPOSITORY = new InjectionToken<IncidentRepository>('IncidentRepository');
export const DETECTION_REPOSITORY = new InjectionToken<DetectionRepository>('DetectionRepository');
export const EVIDENCE_REPOSITORY = new InjectionToken<EvidenceRepository>('EvidenceRepository');
export const STATS_REPOSITORY = new InjectionToken<StatsRepository>('StatsRepository');
