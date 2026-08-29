#!/usr/bin/env node
// Formatter-only PostToolUse hook for convex-backend. It never runs tests, typecheck, or build.
import { spawnSync } from "node:child_process";
import process from "node:process";
const files = process.argv.slice(2).filter((file) => !file.includes("convex/_generated/") && !file.includes("/.agents/skills/") && !file.includes("/.claude/skills/"));
if (files.length === 0) process.exit(0);
const result = spawnSync("pnpm", ["exec", "prettier", "--write", ...files], { cwd: new URL("../..", import.meta.url).pathname.replace(/\/$/, ""), stdio: "inherit" });
if (result.error) { console.error(result.error.message); process.exit(1); }
process.exit(result.status ?? 1);
