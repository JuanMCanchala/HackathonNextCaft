# File ownership rules

- Scope is `convex-backend/`; root `backend/` is Python and out of scope.
- User-owned: `RULES.md`, `.agents/**`, `.claude/**`, and instruction files. Product files require explicit task scope.
- Managed/generated and untouched: `.agents/skills/**`, `.claude/skills/**`, `skills-lock.json`, and `convex/_generated/**`.
