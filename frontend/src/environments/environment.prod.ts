import type { BackendProfile, DataSource } from '../app/core/config/backend-capabilities';
import { clerkConfig } from './clerk.config';

export const environment = {
  production: true,
  backendProfile: 'convex-mvp' as BackendProfile,
  dataSource: 'convex' as DataSource,
  apiBase: 'http://localhost:3000',
  convexUrl: 'http://127.0.0.1:3210',
  clerk: clerkConfig,
  useMockAuth: false,
  useMockRealtime: false,
};
