# Convex-backend skill registry

Scoped index for the user-owned `convex-backend/` project. `SKILL.md` files remain the source of truth. This registry is safe to regenerate from `.agents/skills/*/SKILL.md`; `.claude/skills/` is the mirrored managed projection. Do not hand-edit managed skills or `skills-lock.json`.

| Skill                        | Exact path                                             |
| ---------------------------- | ------------------------------------------------------ |
| convex                       | `.agents/skills/convex/SKILL.md`                       |
| convex-add                   | `.agents/skills/convex-add/SKILL.md`                   |
| convex-advisor               | `.agents/skills/convex-advisor/SKILL.md`               |
| convex-agent                 | `.agents/skills/convex-agent/SKILL.md`                 |
| convex-auth                  | `.agents/skills/convex-auth/SKILL.md`                  |
| convex-authz                 | `.agents/skills/convex-authz/SKILL.md`                 |
| convex-backup                | `.agents/skills/convex-backup/SKILL.md`                |
| convex-billing               | `.agents/skills/convex-billing/SKILL.md`               |
| convex-cost                  | `.agents/skills/convex-cost/SKILL.md`                  |
| convex-create-component      | `.agents/skills/convex-create-component/SKILL.md`      |
| convex-crons                 | `.agents/skills/convex-crons/SKILL.md`                 |
| convex-deploy-guard          | `.agents/skills/convex-deploy-guard/SKILL.md`          |
| convex-design                | `.agents/skills/convex-design/SKILL.md`                |
| convex-docs                  | `.agents/skills/convex-docs/SKILL.md`                  |
| convex-domains               | `.agents/skills/convex-domains/SKILL.md`               |
| convex-env                   | `.agents/skills/convex-env/SKILL.md`                   |
| convex-expert                | `.agents/skills/convex-expert/SKILL.md`                |
| convex-explain-app           | `.agents/skills/convex-explain-app/SKILL.md`           |
| convex-improve-convex-plugin | `.agents/skills/convex-improve-convex-plugin/SKILL.md` |
| convex-insights              | `.agents/skills/convex-insights/SKILL.md`              |
| convex-launch-readiness      | `.agents/skills/convex-launch-readiness/SKILL.md`      |
| convex-migrate               | `.agents/skills/convex-migrate/SKILL.md`               |
| convex-migrate-rehearse      | `.agents/skills/convex-migrate-rehearse/SKILL.md`      |
| convex-monitor               | `.agents/skills/convex-monitor/SKILL.md`               |
| convex-optimize              | `.agents/skills/convex-optimize/SKILL.md`              |
| convex-quickstart            | `.agents/skills/convex-quickstart/SKILL.md`            |
| convex-reviewer              | `.agents/skills/convex-reviewer/SKILL.md`              |
| convex-seed                  | `.agents/skills/convex-seed/SKILL.md`                  |
| convex-self-heal             | `.agents/skills/convex-self-heal/SKILL.md`             |
| convex-sentinel              | `.agents/skills/convex-sentinel/SKILL.md`              |
| convex-suggest               | `.agents/skills/convex-suggest/SKILL.md`               |
| convex-test                  | `.agents/skills/convex-test/SKILL.md`                  |
| convex-verify                | `.agents/skills/convex-verify/SKILL.md`                |

## Scope and resolution

Use only for Convex work under `convex-backend/`. Skip generated output and managed skill directories when editing. Resolve conflicts using `AGENTS.md`/`RULES.md`; current code/tests and canonical docs outrank generic skill advice. In particular, this repository uses Jest, so do not introduce Vitest solely because a generated skill assumes it.
