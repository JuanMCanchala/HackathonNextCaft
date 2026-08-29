import type { AuthConfig } from "convex/server";

/**
 * Clerk JWT provider for Convex.
 *
 * Deploy-time values are placeholders until real Clerk issuer secrets are
 * configured. Mirror CLERK_JWT_ISSUER_DOMAIN / CLERK_JWT_APPLICATION_ID from
 * `.env.example` into the Convex dashboard, then replace these literals
 * (or switch to `process.env.*`) before production.
 */
export default {
  providers: [
    {
      domain: "https://example.clerk.accounts.dev",
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
