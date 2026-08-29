import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { environment } from '../environments/environment';
import {
  AUTH_SERVICE,
  CAMERA_REPOSITORY,
  DETECTION_REPOSITORY,
  EVIDENCE_REPOSITORY,
  INCIDENT_REPOSITORY,
  REALTIME_SERVICE,
  SENTRA_API_BASE,
  STATS_REPOSITORY,
  WORKSPACE_REPOSITORY,
} from './core/config/injection-tokens';
import { AUTH_PROFILE } from './core/auth/auth.service';
import { MockAuthService, MOCK_AUTH_PROFILE } from './core/auth/mock-auth.service';
import { authInterceptor } from './core/http/auth.interceptor';
import { idempotencyInterceptor } from './core/http/idempotency.interceptor';
import { errorInterceptor } from './core/http/error.interceptor';
import { MockRealtimeService } from './core/realtime/mock-realtime.service';
import { ConvexRealtimeService } from './core/realtime/convex-realtime.service';
import { ApiWorkspaceRepository } from './data/repositories/api-workspace.repository';
import { ApiCameraRepository } from './data/repositories/api-camera.repository';
import { ApiIncidentRepository } from './data/repositories/api-incident.repository';
import { ApiDetectionRepository } from './data/repositories/api-detection.repository';
import { ApiEvidenceRepository } from './data/repositories/api-evidence.repository';
import { ApiStatsRepository } from './data/repositories/api-stats.repository';
import { MockWorkspaceRepository } from './data/repositories/mock-workspace.repository';
import { MockCameraRepository } from './data/repositories/mock-camera.repository';
import { MockIncidentRepository } from './data/repositories/mock-incident.repository';
import { MockDetectionRepository } from './data/repositories/mock-detection.repository';
import { MockEvidenceRepository } from './data/repositories/mock-evidence.repository';
import { MockStatsRepository } from './data/repositories/mock-stats.repository';

export function provideSentraCore(): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: SENTRA_API_BASE, useValue: environment.apiBase },

    // Auth — swap MockAuthService → ClerkAuthService in one line (D-3)
    ...(environment.useMockAuth
      ? [
          MockAuthService,
          { provide: AUTH_SERVICE, useExisting: MockAuthService },
          { provide: AUTH_PROFILE, useValue: MOCK_AUTH_PROFILE },
        ]
      : []),

    // Realtime — swap MockRealtimeService → ConvexRealtimeService in one line (D-4)
    environment.useMockRealtime
      ? [
          MockRealtimeService,
          { provide: REALTIME_SERVICE, useExisting: MockRealtimeService },
        ]
      : [
          ConvexRealtimeService,
          { provide: REALTIME_SERVICE, useExisting: ConvexRealtimeService },
        ],

    // Repositories — swap Mock* → Api* in one line per token
    {
      provide: WORKSPACE_REPOSITORY,
      useClass: environment.useMockRepositories ? MockWorkspaceRepository : ApiWorkspaceRepository,
    },
    {
      provide: CAMERA_REPOSITORY,
      useClass: environment.useMockRepositories ? MockCameraRepository : ApiCameraRepository,
    },
    {
      provide: INCIDENT_REPOSITORY,
      useClass: environment.useMockRepositories ? MockIncidentRepository : ApiIncidentRepository,
    },
    {
      provide: DETECTION_REPOSITORY,
      useClass: environment.useMockRepositories ? MockDetectionRepository : ApiDetectionRepository,
    },
    {
      provide: EVIDENCE_REPOSITORY,
      useClass: environment.useMockRepositories ? MockEvidenceRepository : ApiEvidenceRepository,
    },
    {
      provide: STATS_REPOSITORY,
      useClass: environment.useMockRepositories ? MockStatsRepository : ApiStatsRepository,
    },

    provideHttpClient(
      withInterceptors([authInterceptor, idempotencyInterceptor, errorInterceptor]),
    ),
  ]);
}
