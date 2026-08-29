# Angular + Convex + Clerk Integration Contract

**Status:** Frontend integration contract for Sentra MVP  
**Audience:** Angular frontend team  
**Backend:** `convex-backend/`  
**Authentication provider:** Clerk  
**JWT template:** `convex`

This document defines the integration contract between the Angular frontend, Clerk, and the Convex backend. The frontend MUST follow this contract when authenticating users or calling protected Convex functions.

## 1. Source of truth

Use these backend documents as the canonical product contract:

- `API-CONTRACT.md` — DTOs, enums, pagination, errors, and UI permissions.
- `api-contract.schemas.json` — machine-readable response schemas.
- `SENTRA-PRD.md` — product intent and scope.
- `DOMAIN-DESIGN.md` — domain entities and invariants.
- `USE-CASES.md` — user workflows.
- `API-SITEMAP.md` — planned HTTP surface.

The server is authoritative. Frontend validation improves UX but MUST NOT be treated as authorization.

## 2. Authentication configuration

The Convex backend validates Clerk JWTs using:

```ts
// convex/auth.config.ts
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: process.env.CLERK_JWT_APPLICATION_ID!,
    },
  ],
};
```

The configured development issuer is:

```text
https://premium-humpback-2836.clerk.accounts.dev
```

The Clerk JWT template MUST be named exactly:

```text
convex
```

The generated JWT MUST contain an audience compatible with the Convex provider configuration:

```json
{
  "aud": "convex"
}
```

The frontend MUST request this template explicitly:

```ts
const token = await clerk.session?.getToken({ template: "convex" });
```

## 3. Frontend environment variables

Development configuration for Angular CLI:

```ts
// src/environments/environment.ts
export const environment = {
  production: false,
  clerkPublishableKey: "pk_test_...",
  convexUrl: "http://localhost:3210",
};
```

For a tunneled development backend, set `convexUrl` to the stable Convex API hostname:

```ts
convexUrl: 'https://convex-dev.example.com',
```

For production, use the production Clerk publishable key and the production Convex URL. Values in `environment.ts` are public and are bundled into the browser.

Never expose or bundle these values in Angular:

```env
CLERK_SECRET_KEY=...
CONVEX_SELF_HOSTED_ADMIN_KEY=...
CONVEX_DEPLOY_KEY=...
```

`CLERK_SECRET_KEY` and Convex admin/deploy keys are server or infrastructure secrets. They MUST NOT be copied into `environment.ts`, browser code, or any `VITE_*` variable.

## 4. Required packages

Install the browser-compatible Clerk SDK and Convex client in the Angular application:

```bash
pnpm add @clerk/clerk-js convex
```

If the Angular project uses npm, the equivalent command is:

```bash
npm install @clerk/clerk-js convex
```

The frontend MUST NOT use `@clerk/backend` or any SDK that requires `CLERK_SECRET_KEY` in browser code.

## 5. Angular authentication service

Create one application-scoped service responsible for Clerk initialization and Convex authentication. Do not instantiate Clerk or Convex independently in every component.

```ts
import { Injectable } from "@angular/core";
import { Clerk } from "@clerk/clerk-js";
import { ConvexClient } from "convex/browser";
import { BehaviorSubject } from "rxjs";

import { environment } from "../environments/environment";

@Injectable({ providedIn: "root" })
export class AuthService {
  readonly clerk = new Clerk(environment.clerkPublishableKey);
  readonly convex = new ConvexClient(environment.convexUrl);
  readonly isReady$ = new BehaviorSubject(false);
  readonly isAuthenticated$ = new BehaviorSubject(false);

  async initialize(): Promise<void> {
    await this.clerk.load();

    this.convex.setAuth(
      async () => {
        const session = this.clerk.session;
        if (!session) return null;

        return session.getToken({ template: "convex" });
      },
      (isAuthenticated) => this.isAuthenticated$.next(isAuthenticated),
    );

    this.isAuthenticated$.next(Boolean(this.clerk.user));
    this.isReady$.next(true);
  }

  async signIn(): Promise<void> {
    await this.clerk.redirectToSignIn();
  }

  async signOut(): Promise<void> {
    await this.clerk.signOut();
    this.convex.clearAuth();
    this.isAuthenticated$.next(false);
  }
}
```

The actual Angular bootstrap mechanism MAY differ, but the following invariants MUST remain:

1. Clerk MUST be loaded before protected Convex calls.
2. Convex MUST receive the Clerk JWT through `setAuth`.
3. The token fetcher MUST request the `convex` template.
4. The client MUST return `null` when no Clerk session exists.
5. Components MUST wait for authentication initialization before calling protected functions.

## 6. Calling Convex functions

Use generated Convex references from the backend:

```ts
import { api } from "../../convex/_generated/api";

const workspaces = await authService.convex.query(api.workspaces.list, {
  paginationOpts: {
    cursor: null,
    numItems: 25,
  },
});
```

The frontend MUST NOT send `workspaceId` as proof of authorization. The backend derives identity from the JWT and resolves the caller's active workspace membership.

Protected operations MUST only be enabled after `isAuthenticated$` is true. The backend still re-checks authentication and authorization on every call.

## 7. Supported first-slice operations

| Operation       | Frontend access | Required role             |
| --------------- | --------------- | ------------------------- |
| List workspaces | Convex query    | Authenticated member      |
| Get workspace   | Convex query    | Authenticated member      |
| List cameras    | Convex query    | Viewer, operator, admin   |
| Get camera      | Convex query    | Viewer, operator, admin   |
| Create camera   | Convex mutation | Workspace admin           |
| List incidents  | Convex query    | Viewer, operator, admin   |
| Get incident    | Convex query    | Viewer, operator, admin   |
| Triage incident | Convex mutation | Operator, workspace admin |

The internal detection intake MUST NOT be called from Angular or any browser client.

## 8. Error handling

Map Convex/backend errors to the shared API error model:

```ts
type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "IDEMPOTENCY_CONFLICT"
  | "RATE_LIMITED"
  | "EVIDENCE_UNAVAILABLE"
  | "INTERNAL_ERROR";
```

Required behavior:

- `UNAUTHENTICATED`: refresh Clerk session or redirect to sign-in.
- `FORBIDDEN`: hide or disable the action and show a permission message.
- `NOT_FOUND`: treat foreign resources the same as missing resources.
- `VALIDATION_ERROR`: map field details to the form.
- `CONFLICT`: refresh the resource and ask the user to retry.
- `IDEMPOTENCY_CONFLICT`: do not retry with the same key and different payload.
- `INTERNAL_ERROR`: show a generic message and preserve the `requestId` for support.

Frontend error handling MUST NOT display raw stack traces, tokens, provider responses, or infrastructure secrets.

## 9. Realtime and lifecycle

Convex queries are reactive. Prefer a single subscription per view and let Angular update the view from the subscription result. Do not implement a second polling loop for the same data unless the product explicitly requires a fallback.

The frontend MUST:

- unsubscribe when a component or route is destroyed;
- clear Convex auth on Clerk sign-out;
- handle token refresh through the `setAuth` token fetcher;
- avoid calling protected queries while Clerk is still loading;
- treat `resolved` and `dismissed` incidents as terminal for the current MVP.

## 10. Development connectivity

Default local Compose endpoints:

```text
Convex API:     http://localhost:3210
HTTP actions:   http://localhost:3211
Dashboard:      http://localhost:6791
```

When Cloudflare Tunnel is enabled, the frontend MUST use the configured stable Convex hostname in `VITE_CONVEX_URL`. It MUST NOT use the dashboard hostname as the Convex client URL.

The tunnel is development infrastructure only. It does not replace Clerk authentication or backend authorization.

## 11. Acceptance checklist

- [ ] Clerk application uses the correct development instance.
- [ ] JWT template name is exactly `convex`.
- [ ] JWT includes `aud: "convex"`.
- [ ] `VITE_CLERK_PUBLISHABLE_KEY` is configured in Angular.
- [ ] `VITE_CONVEX_URL` points to the Convex API origin, not the dashboard.
- [ ] Angular calls `ConvexClient.setAuth` with Clerk's `convex` template token.
- [ ] No secret key is present in frontend environment variables or bundles.
- [ ] Protected calls wait until Clerk and Convex authentication are ready.
- [ ] Unauthenticated, foreign-workspace, and insufficient-role cases are tested.
- [ ] Sign-out clears Convex authentication.
- [ ] A real signed-in user can call a protected workspace query.
- [ ] A user from another workspace cannot read or mutate the resource.

## 12. Explicitly out of scope

This contract does not authorize the frontend to:

- call `/internal/v1/detections`;
- use `CLERK_SECRET_KEY`;
- use Convex admin keys;
- trust client-provided workspace ownership;
- bypass Convex validators or server authorization;
- implement service-key management;
- expose evidence storage credentials;
- treat AI/model confidence as human confirmation.
