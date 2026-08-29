export const environment = {
  production: false,
  /**
   * Integración backend real (cuando esté listo):
   * 1. apiBase → URL del API HTTP /v1
   * 2. useMockAuth → false + registrar ClerkAuthService en AUTH_SERVICE
   * 3. useMockRealtime → false → usa ConvexRealtimeService (placeholder hasta Convex)
   * 4. useMockRepositories → false (ya es el default; Api* apunta a apiBase)
   */
  apiBase: 'http://localhost:3000',
  useMockAuth: true,
  useMockRealtime: true,
  /** false → Api*Repository against SENTRA_API_BASE (json-server). true → in-memory Mock*. */
  useMockRepositories: false,
};
