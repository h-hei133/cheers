# HANDOFF.md — Project Pitfalls & Operational Guardrails

This file records non-obvious technical pitfalls, environment hazards, and operational lessons discovered during development.
**Rule**: Read this file before starting a new task to avoid repeating past mistakes. When you hit and resolve a non-obvious trap during a task, append a concise entry (Symptom / Root Cause / Rule) before finishing. Keep entries factual and actionable; do not use this file as a task log or changelog.

---

## Pitfalls & Guardrails

### 1. WSL2 OOM-Killer Crash Under Concurrent Build / Test Execution
- **Symptom**: WSL2 abruptly terminates `vitest`, `tsc`, `node`, or the entire agent process without a JS stack trace (`Killed` / exit 137).
- **Root Cause**: `vitest` worker pools, full-graph `tsc`, and `normproof judge` (10,000+ AST edges) each consume 1.5 GB–4 GB+ peak RSS. Running multiple heavy commands concurrently (via parallel tool calls, background `&` jobs, or multiple subagents running tests simultaneously) exhausts WSL2 memory and triggers the Linux kernel OOM-Killer.
- **Rule**:
  1. **Strict Mutual Exclusion**: Never run `tsc`, `vitest`, `npm run build*`, `npm run test*`, `npm run verify:*`, or `normproof` concurrently. Chain sequential steps with `&&`.
  2. **Subagent Ban**: Delegated subagents (`task`) must NEVER run build, test, or verification commands mid-flight; only the main agent runs verification once after integration.
  3. **Batch & Fast-Fail**: Pass multiple target test files into a single `vitest run a.test.ts b.test.ts` invocation rather than spawning separate processes. Run sub-second static checks (`verify:import-cycles`, `check:*`, `verify:docs-drift:strict`) before heavy suites so failures short-circuit cheaply.

### 2. Local TypeScript ESM Specifier Resolution
- **Symptom**: Runtime or `normproof judge` fails with unresolved module specifiers even when IDE hover works.
- **Root Cause**: Node ESM and the repository's bundler/structural gates require explicit `.js` extensions on relative imports to local TypeScript modules.
- **Rule**: Always end relative imports to local `.ts`/`.tsx` files with `.js` (e.g., `import { foo } from './bar.js'`), and run `npm run verify:import-cycles && npm run verify:docs-drift:strict` before heavy test suites.

### 3. Documentation & Rule Path Drift Gate (`verify:docs-drift:strict`)
- **Symptom**: CI gate `npm run verify:docs-drift:strict` fails after editing `AGENTS.md`, `agent-rules/*.md`, or `.wiki/_index.md`.
- **Root Cause**: `scripts/verify-docs-and-rules-drift.mjs` parses inline backtick paths and fenced code block paths in rule files and verifies they resolve on disk. Mentioning deleted or hypothetical paths in backticks/fences breaks the gate.
- **Rule**: Any repository file or directory path wrapped in backticks or placed on its own line in a fenced block inside `AGENTS.md` or `agent-rules/` must exist on disk. Run `npm run verify:docs-drift:strict` whenever editing rule or index markdown files.

### 4. Node 20.3.0 Runtime Floor Gate (`check:node-floor`)
- **Symptom**: Code passes locally on Node 22/24, but `npm run check:node-floor` or CI fails immediately.
- **Root Cause**: `package.json` and CI enforce `node >=20.3.0`. APIs introduced in Node 21/22+ are missing on the CI runner.
- **Rule**: Never call `Promise.withResolvers`, `Object.groupBy`, `Map.groupBy`, `Array.fromAsync`, `Set.prototype.union`/`intersection`/`difference`, `Symbol.dispose`, `process.getBuiltinModule`, or `fs.globSync`. Run `npm run check:node-floor` before finishing.

### 5. Temporary Diagnostic & PTY Residue in Repository Root
- **Symptom**: `.tmp-*` logs, PTY snapshots, or throwaway scripts accumulate in the repository root and pollute `git status`.
- **Root Cause**: Diagnostic scripts or manual PTY runs write directly to `./.tmp-*` instead of a contained scratch directory and exit without cleanup.
- **Rule**: Place all temporary test homes, logs, and throwaway scripts inside `.tmp/` (gitignored) or `/tmp/cheers-test/`, never as top-level `.tmp-*` files in the repo root. Remove temporary scripts/artifacts before yielding.
