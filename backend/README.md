# Hackathon NextCraft backend

A strict TypeScript Convex backend scaffold with the Convex Agent Component and an OpenAI-powered support agent.

## Stack

- Convex for functions, persistence, realtime updates, and deployment
- `@convex-dev/agent` for threads and persisted agent messages
- AI SDK with `@ai-sdk/openai` for model access
- Zod is available for tool and application-level schemas
- pnpm, ESLint, Prettier, Jest, and strict TypeScript

Convex replaces the persistence/backend concerns that would otherwise require Prisma, PostgreSQL, or Redis. Those dependencies are intentionally not included.

## Setup

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

`pnpm dev` authenticates with Convex and creates or selects a deployment. Set `OPENAI_API_KEY` in the deployment environment (or through the Convex dashboard) before invoking the support agent.

The first `convex dev`/`convex codegen` run generates `convex/_generated`. That directory is intentionally ignored because it is deployment-specific generated code.

## API

- `api.chat.createThread` creates a persisted thread.
- `api.chat.sendMessage` generates and stores a response for a thread.
- `api.chat.continueThread` continues a persisted thread.
- `api.chat.listMessages` reads the thread history with pagination.

The public functions include runtime validators. Authentication and ownership checks are marked in `convex/chat.ts`; wire them to the project's auth provider before exposing these functions to untrusted clients.

## Quality commands

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm codegen
```

## Project structure

```text
convex/
  agents.ts       # Support Agent definition
  chat.ts         # Thread and chat functions
  convex.config.ts# Agent Component registration
  schema.ts       # App-owned metadata schema
  validation.ts   # Pure input normalization
 tests/           # Unit tests for pure helpers
```

## AI coding agents

Read `AGENTS.md` before changing this backend. Keep Convex functions small and feature-oriented, validate every public argument, and never commit secrets or generated files. Confirm current Convex and Agent Component APIs against their documentation when upgrading dependencies.
