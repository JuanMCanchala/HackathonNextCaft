import type { BackendProfile, DataSource } from '../app/core/config/backend-capabilities';
import { clerkConfig } from './clerk.config';

export const environment = {
  production: true,
  backendProfile: 'convex-mvp' as BackendProfile,
  dataSource: 'convex' as DataSource,
  apiBase: 'http://localhost:3000',
  /**
   * Motor de vision, que corre en el equipo de la demo. Convex guarda los
   * incidentes confirmados; esto es el video entrando y el gate trabajando,
   * y solo existe mientras el motor esta levantado.
   */
  visionBase: 'http://localhost:8000',
  convexUrl: 'https://adventurous-wolf-401.convex.cloud',
  clerk: clerkConfig,
  useMockAuth: false,
  useMockRealtime: false,
};
