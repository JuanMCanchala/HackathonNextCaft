# Testing rules

- Follow TDD and the repository Jest runner (`pnpm test`); do not introduce Vitest based on generated skill assumptions.
- Add negative authorization and boundary tests, then run focused tests plus typecheck, lint, format check, and build.
- `pnpm exec convex dev --once` is conditional validation, never a replacement for tests.
