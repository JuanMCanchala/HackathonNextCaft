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
  /**
   * Apunta al despliegue de produccion, no al Convex local.
   *
   * El pipeline de vision escribe en produccion (CONVEX_INTAKE_URL en el .env
   * de la raiz), y el Convex local tiene su propia base de datos: leyendo de
   * 127.0.0.1 el panel se queda vacio mientras los incidentes entran por otro
   * lado. Para trabajar contra el backend local, levanta `pnpm dev` en
   * convex-backend y cambia esta linea por 'http://127.0.0.1:3210'.
   */
  convexUrl: 'https://adventurous-wolf-401.convex.cloud',
  clerk: clerkConfig,
  useMockAuth: false,
  /** false = solo datos Convex; sin simulador de detecciones/cámaras fake */
  useMockRealtime: false,
};
