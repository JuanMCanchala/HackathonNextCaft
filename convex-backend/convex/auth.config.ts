import type { AuthConfig } from "convex/server";

/**
 * Clerk JWT provider for Convex.
 *
 * Configure these variables in the Convex deployment environment. They are
 * intentionally read at deployment time rather than committed to source.
 */
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: process.env.CLERK_JWT_APPLICATION_ID!,
    },
  ],
} satisfies AuthConfig;
