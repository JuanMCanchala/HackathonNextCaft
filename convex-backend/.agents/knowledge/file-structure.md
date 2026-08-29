# File structure

- `convex/`: user-owned Convex implementation; `convex/_generated/`: generated, never hand-edit.
- `tests/`: Jest tests and negative authorization coverage.
- `docs/`: product/API contracts listed in `AGENTS.md`.
- `openspec/`: change intent/configuration, edit only when scoped.
- `.agents/` and `.claude/`: mirrored user-owned agent governance; their `skills/` trees are managed and untouched.
