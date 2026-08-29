import type { BackendProfile, DataSource } from '../app/core/config/backend-capabilities';
import { clerkConfig } from './clerk.config';

/**
 * Perfil por defecto = Convex MVP.
 * Mock local: dataSource 'http' + npm run mock:api
 */
export const environment = {
  production: false,
  backendProfile: 'convex-mvp' as BackendProfile,
  dataSource: 'convex' as DataSource,
  apiBase: 'http://localhost:3000',
  /** Local: http://127.0.0.1:3210 tras `pnpm dev` en convex-backend */
  convexUrl: 'http://127.0.0.1:3210',
  clerk: clerkConfig,
  useMockAuth: false,
  /** false = solo datos Convex; sin simulador de detecciones/cámaras fake */
  useMockRealtime: false,
};
