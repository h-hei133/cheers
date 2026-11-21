# AGENTS.md

## Purpose

This file is the startup index for agents working in this repository. Keep it concise. Detailed durable rules live under `agent-rules/`.

## Scope

Writable target repository:

```text
/home/wang/projects/cheers
```

Only this repository may be modified. Reference repositories are read-only and are used only for targeted semantic comparison.

RTK command discipline is configured outside this repository. Follow the global Codex and RTK instructions when running shell commands.

## Engineering Principles & Handoff Memory

- **First-Principles Thinking**: Start from the fundamental problem. Confirm the real goal, hard constraints, and verifiable success criteria before acting. Do not blindly follow convention or copy legacy patterns when a simpler, direct path solves the root problem.
- **Pitfall Memory (`HANDOFF.md`)**: Before touching an unfamiliar subsystem, search `HANDOFF.md` by domain keyword (`rg -i "<topic>" HANDOFF.md`) to avoid known pitfalls. Keep `HANDOFF.md` compact (`<15 KB`) for reusable traps only; historical batch entries live in `.wiki/refactor/handoff-archive-2026.md`. When you solve a non-obvious trap, add a concise entry under the owning section before finishing.
- **MUI (Minimal UI)**: Avoid unnecessary secondary labels and descriptions. Let the layout do the explaining.

## Non-Negotiable Safety

- Live provider models are configured and permitted for development, debugging, and end-to-end verification.
- Isolate temporary runtime state, diagnostic scripts, and test artifacts inside `.tmp/` or `/tmp/cheers-test/` — never scatter `.tmp-*` files or logs in the repository root, and clean up temporary residue before finalizing.
- Never print, log, commit, or hardcode raw API keys, tokens, authorization headers, or secret credentials; preserve report-safe redaction.
- Keep provider/network/auth failures distinct from product route failures.
- Do not infer write authorization from prompt text.
- Keep dry-run, preview, permission-pending, denied, blocked, approved-for-write, and write-success states distinct.
- Do not hide unverified write outcomes behind success-like terminal or session states.
- Do not change unrelated runtime code.
- Provider/auth core, release/default gates, package scripts, and build behavior require explicit task scope.

Detailed rules: [provider and secret boundary](agent-rules/provider-and-secret-boundary.md), [evidence and truthfulness](agent-rules/evidence-and-truthfulness.md).

## Architecture Summary

- **TypeScript Monorepo Control Plane**: Cheers is a 9-package TypeScript workspace (`package.json` `workspaces`):
  - `packages/ts-shell`: primary shell, CLI, session, orchestration, query loop, slash commands, permission UX, recovery, replay, runtime durability, result mapping, hooks, sandbox, and composition root.
  - Eight independent domain packages (`packages/advisor`, `packages/browser`, `packages/collaboration`, `packages/desktop`, `packages/media`, `packages/planning`, `packages/research`, `packages/workflow`): unidirectional dependencies only — no domain package may import or transitively reach `packages/ts-shell`, and cross-package imports must use declared public package entries (`exports`).
- **Execution Boundary**: Commands and workspace side effects run through `packages/ts-shell/src/runtime/execution/` (`service.ts` projects results, `local.ts` spawns and streams processes) and sanctioned tool/edit/sandbox owners.
- **Isolation**: OS isolation is owned by `packages/ts-shell/src/sandbox/` (`bwrap` on Linux, `sandbox-exec` on macOS). There is no second execution daemon.
- **Reuse Mature Native Tools**: Call installed native tools (e.g., `rg` with in-process fallback) rather than reimplementing them. Keep the core control plane and CLI in TypeScript; introducing a native binding or auxiliary tool requires concrete benchmark or platform evidence and explicit scope.
- **Distribution**: `npm run build:exe` compiles a single-file executable (no Node required) with baked-in package metadata.
- **Knowledge Base**: Active architecture notes, guides, and upgrade records live under `.wiki/` (`.wiki/_index.md`). Historical RFCs and older refactor plans are archival context only.

Detailed rules: [architecture boundaries](agent-rules/architecture-boundaries.md).

## Ownership And Naming Summary

- Put behavior in the owning workspace package and domain module instead of central orchestration, entrypoint files, compatibility shims, or vague helper buckets.
- Prefer multi-level owner-domain structure where folders carry context and files use short local role names (`model`, `contract`, `policy`, `projection`, `renderer`, `adapter`, `state`, `events`, `stream`, `index`).
- Do not encode roadmap titles, implementation phases, or development-process milestone labels into product filenames.
- Compatibility wrappers must remain thin and delegate or re-export only; they must not accumulate new behavior.
- Keep TypeScript imports ending in `.js` when importing local TypeScript modules that compile to JavaScript.
- Avoid external-project names and development-process vocabulary in product code, filenames, public runtime fields, and user-visible output unless explicitly historical or compatibility-only.

Detailed rules: [file placement and naming](agent-rules/file-placement-and-naming.md), [compatibility and history](agent-rules/compatibility-and-history.md).

## Validation Summary

- **No Concurrent Heavy Execution (OOM Prevention)**: NEVER run compilation, test, or verification commands (`tsc`, `vitest`, `npm run build*`, `npm run test*`, `npm run verify:*`, `normproof`) concurrently across parallel tool calls, background jobs, or subagents. Concurrent heavy processes trigger the WSL2 Linux OOM-Killer and crash the session.
- **Batch & Fast-Fail Serial Chaining**: Chain sequential checks with `&&`. Run Tier-1 sub-second static gates before heavy builds or `vitest` so failures short-circuit immediately. Pass multiple target test files into one `vitest run <fileA> <fileB>` invocation rather than spawning separate processes.
- **Subagent Execution Ban**: Delegated subagents must NEVER run `build`, `vitest`, or `normproof` mid-flight. Subagents only research or edit their slice; the main agent runs verification serially once after integration.
- Run focused validation tied to the files and behavior changed; do not default to full-repository validation when a focused gate covers the risk.
- If only markdown files change, do not run build/tests (except `npm run verify:docs-drift:strict` when editing rule/index/active docs).
- Classify failing tests before changing implementation or tests; never claim validation passed unless the command ran and passed.

Blocking CI & local static gates (covering all workspace packages):

- `npm run verify:import-cycles` — TypeScript AST runtime import cycles and cross-package boundary violations.
- `npm run check:config-consumers` — declared config fields with no production reader.
- `npm run check:declarations` — hook events without dispatch sites and unregistered tool factories.
- `npm run check:node-floor` — enforces `engines.node` (`>=20.3.0`, catching Node 21/22+ APIs such as `Promise.withResolvers`, `Object.groupBy`, `Map.groupBy`, `Array.fromAsync`, `Set.prototype.union`/`intersection`/`difference`, `Symbol.dispose`, `process.getBuiltinModule`, `fs.globSync`).
- `npm run check:lint` — Biome lint checks (`--error-on-warnings`).
- `npm run verify:docs-drift:strict` — dangling path references in binding rules and active docs.
- `npm run test:ts` — TypeScript test suite across workspaces (`--workspaces --if-present`).
- `npm run test:scripts` — tests for all repository static gates and NormProof adapter conformance.
- `normproof judge` — structural proof judgement via the pinned archive (`.normproof/normproof-0.1.0.tgz`).

Detailed rules: [testing and validation](agent-rules/testing-and-validation.md), [development workflow](agent-rules/development-workflow.md).

## Reference Repositories

Read-only references:

- Claude Code, codex, oh-my-pi, deepseek-harness, opencode, OpenHands, Stagehand, Playwright MCP, MemPalace, mem0, graphiti, Inspect AI, mini-swe-agent, pi, GitNexus.

Inspect the target repository implementation first, and consult references only for task-relevant semantic comparison on non-trivial runtime/architecture decisions. Do not broad-scan references without a direct blocker or copy code wholesale.

Detailed rules: [reference repositories](agent-rules/reference-repositories.md).

## Detailed Rules

- [agent-rules/README.md](agent-rules/README.md)
- [agent-rules/reference-repositories.md](agent-rules/reference-repositories.md)
- [agent-rules/file-placement-and-naming.md](agent-rules/file-placement-and-naming.md)
- [agent-rules/architecture-boundaries.md](agent-rules/architecture-boundaries.md)
- [agent-rules/evidence-and-truthfulness.md](agent-rules/evidence-and-truthfulness.md)
- [agent-rules/provider-and-secret-boundary.md](agent-rules/provider-and-secret-boundary.md)
- [agent-rules/testing-and-validation.md](agent-rules/testing-and-validation.md)
- [agent-rules/development-workflow.md](agent-rules/development-workflow.md)
- [agent-rules/compatibility-and-history.md](agent-rules/compatibility-and-history.md)

## Architectural Norms (NormProof)

NormProof governs structural invariants across all 9 workspace packages through both active hooks (`.agents/hooks.json`: PreToolUse `write-gate` and Stop `completion-gate`) and terminal judgement (`normproof judge`, pack `.normproof/norm-packs/software-structure-v0/profile.json`):

| Obligation / Rule | Enforcement | Scope & Policy |
|---|---|---|
| `source_graph_has_no_unresolved_specifiers` | **Blocking** (`judge`, Stop, `write-gate` export advisory) | Every relative and workspace package import resolves within the declared source graph with valid exports. |
| `source_graph_is_acyclic` | **Blocking** (`judge`, Stop, `write-gate` `noNewCycle`, `verify:import-cycles`) | Zero runtime value dependency cycles (`type-only` edges are excluded from cycle checks). |
| `domains_do_not_reach_shell` | **Blocking** (`judge`, Stop, `write-gate` `noReachableDependency`) | No package under `packages/**` (excluding `packages/ts-shell/**`) may directly or transitively reach `packages/ts-shell/**`. |
| `execution_does_not_reach_cli` | Advisory (`judge`), **Blocking** on new paths (`write-gate`) | `packages/ts-shell/src/runtime/execution/**` must not reach `packages/ts-shell/src/cli/**`. |
| `declared_functions_within_module_ceiling` | Advisory (`judge`), **Blocking** above ceiling (`write-gate` `moduleFunctionBaseline`) | Production modules (`packages/*/src/**/*.ts*`, excluding `**/*.test.ts*` and `**/*.spec.ts*`) stay within the v2 baseline seed floor (`20` functions, or legacy accepted ceiling in `.normproof/baseline.json`). Check facades via `npm run analyze:module-facades`. |
| `filenames_carry_no_phase_labels` | **Blocking** (`write-gate`) | New files under `packages/**/*.ts*` must not carry temporary phase/version tokens (`-v2`, `-new`, `-old`, `-temp`, `-mvp`, `-phase`, etc.). |

### Architecture Watch Disposition Protocol

`.normproof/dispositions.md` is where reviewed advisory findings decided NOT to change yet get recorded (append-only):

```text
- <obligation-id> | <finding> | reviewed <date> | decision: fix|defer|ignore | reason: <one line>
```

Rules:
- Recording a disposition NEVER changes the verdict — `judge` keeps reporting the finding every run.
- Prefer fixing repeated findings; record a disposition only when deferring is a real engineering decision.
- Never delete previous disposition lines; append only.
