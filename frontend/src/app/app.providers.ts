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
  SENTRA_CONVEX_URL,
  STATS_REPOSITORY,
  WORKSPACE_REPOSITORY,
} from './core/config/injection-tokens';
import {
  BACKEND_CAPABILITIES,
  capabilitiesFor,
  type DataSource,
} from './core/config/backend-capabilities';
import { AUTH_PROFILE } from './core/auth/auth.service';
import { ClerkAuthService } from './core/auth/clerk-auth.service';
import { provideClerkAuthProfile } from './core/auth/clerk-auth-profile';
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
import { ConvexWorkspaceRepository } from './data/repositories/convex-workspace.repository';
import { ConvexCameraRepository } from './data/repositories/convex-camera.repository';
import { ConvexIncidentRepository } from './data/repositories/convex-incident.repository';
import { ConvexDetectionRepository } from './data/repositories/convex-detection.repository';
import { ConvexEvidenceRepository } from './data/repositories/convex-evidence.repository';
import { DerivedStatsRepository } from './data/repositories/derived-stats.repository';

function resolveDataSource(): DataSource {
  return environment.dataSource;
}

export function provideSentraCore(): EnvironmentProviders {
  const caps = capabilitiesFor(environment.backendProfile);
  const source = resolveDataSource();

  const workspaceRepo =
    source === 'memory'
      ? MockWorkspaceRepository
      : source === 'convex'
        ? ConvexWorkspaceRepository
        : ApiWorkspaceRepository;
  const cameraRepo =
    source === 'memory'
      ? MockCameraRepository
      : source === 'convex'
        ? ConvexCameraRepository
        : ApiCameraRepository;
  const incidentRepo =
    source === 'memory'
      ? MockIncidentRepository
      : source === 'convex'
        ? ConvexIncidentRepository
        : ApiIncidentRepository;
  const detectionRepo =
    source === 'memory'
      ? MockDetectionRepository
      : source === 'convex'
        ? ConvexDetectionRepository
        : ApiDetectionRepository;
  const evidenceRepo =
    source === 'memory'
      ? MockEvidenceRepository
      : source === 'convex'
        ? ConvexEvidenceRepository
        : ApiEvidenceRepository;
  const statsRepo =
    source === 'memory'
      ? MockStatsRepository
      : !caps.statsApi || source === 'convex'
        ? DerivedStatsRepository
        : ApiStatsRepository;

  return makeEnvironmentProviders([
    { provide: SENTRA_API_BASE, useValue: environment.apiBase },
    { provide: SENTRA_CONVEX_URL, useValue: environment.convexUrl },
    { provide: BACKEND_CAPABILITIES, useValue: caps },

    ...(environment.useMockAuth
      ? [
          MockAuthService,
          { provide: AUTH_SERVICE, useExisting: MockAuthService },
          { provide: AUTH_PROFILE, useValue: MOCK_AUTH_PROFILE },
        ]
      : [
          ClerkAuthService,
          { provide: AUTH_SERVICE, useExisting: ClerkAuthService },
          { provide: AUTH_PROFILE, useFactory: provideClerkAuthProfile },
        ]),

    environment.useMockRealtime
      ? [
          MockRealtimeService,
          { provide: REALTIME_SERVICE, useExisting: MockRealtimeService },
        ]
      : [
          ConvexRealtimeService,
          { provide: REALTIME_SERVICE, useExisting: ConvexRealtimeService },
        ],

    { provide: WORKSPACE_REPOSITORY, useClass: workspaceRepo },
    { provide: CAMERA_REPOSITORY, useClass: cameraRepo },
    { provide: INCIDENT_REPOSITORY, useClass: incidentRepo },
    { provide: DETECTION_REPOSITORY, useClass: detectionRepo },
    { provide: EVIDENCE_REPOSITORY, useClass: evidenceRepo },
    { provide: STATS_REPOSITORY, useClass: statsRepo },

    provideHttpClient(
      withInterceptors([authInterceptor, idempotencyInterceptor, errorInterceptor]),
    ),
  ]);
}
