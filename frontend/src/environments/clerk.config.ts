/** Clerk — instancia premium-humpback-2836 (publishable key es segura en frontend). */
export const clerkConfig = {
  publishableKey:
    'pk_test_cHJlbWl1bS1odW1wYmFjay0yODM2LmNsZXJrLmFjY291bnRzLmRldiQ',
  jwtIssuerDomain: 'https://premium-humpback-2836.clerk.accounts.dev',
  jwtApplicationId: 'convex',
  signInUrl: '/sign-in',
  signUpUrl: '/sign-up',
  afterSignInUrl: '/app',
} as const;

export type ClerkConfig = typeof clerkConfig;
