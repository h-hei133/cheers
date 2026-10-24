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
- **Pitfall Memory (`HANDOFF.md`)**: Before starting a new task, read `HANDOFF.md` at the repository root to avoid repeating known pitfalls. When you encounter and solve a non-obvious trap during work, append the root cause and guardrail to `HANDOFF.md` before finishing.
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

- TypeScript is the primary product runtime and control plane: shell, session, orchestration, query loop, slash commands, permission UX, recovery, replay, runtime durability, result mapping, terminal/session surface, high-level capability routing, and every current execution adapter.
- Execution is an explicit runtime boundary/interface implemented in `packages/ts-shell/src/` (see `core/tools/`, `tools/`, `sandbox/`, and the `browser/*Executor.ts` adapters). Commands run through `runtime/execution/`, which is the single execution path: `runtime/execution/service.ts` projects a result, `runtime/execution/local.ts` spawns the process and streams its output.
- Isolation is owned by `sandbox/` (`bwrap` on Linux, `sandbox-exec` on macOS), not by a separate runtime. There is no second execution plane.
- Where a mature native tool already exists, call it instead of reimplementing it in-process. `grep` runs `rg` when it is installed and falls back to the in-process walk when it is not; the fallback is what keeps a machine without `rg` working. Do not add a second language to reach the same speed — the compared implementations all reach it by running ripgrep, one of them by linking its crates.
- Distribution: `npm run build:exe` compiles a single-file executable (no Node required, ~7× faster startup). The build bakes in the version and name, because a compiled binary has no manifest to read.
- `contracts` carries schemas, events, lifecycle states, permission semantics, and serialization rules only when there is a real cross-runtime consumer.
- The product is single-language: TypeScript. There is no Rust or Python workspace member. A native sandbox module may be reconsidered if a benchmark shows `bwrap` is insufficient; until such evidence exists, adding a second language is a cost with no measured benefit.
- Project master knowledge base, technical RFCs (RFC-001 through RFC-004), and architecture specifications live in `.wiki/` (`.wiki/_index.md`).
Detailed rules: [architecture boundaries](agent-rules/architecture-boundaries.md).

## Ownership And Naming Summary

- Put behavior in the owning module or domain instead of central orchestration, entrypoint files, compatibility shims, or vague helper buckets.
- Prefer multi-level owner-domain structure where folders carry context and files use short local role names.
- Use short, responsibility-based file names such as `model`, `contract`, `policy`, `projection`, `renderer`, `adapter`, `state`, `events`, `stream`, or `index` only inside clear domain folders.
- Do not encode an entire feature, roadmap title, implementation phase, or historical route name into a product file name.
- Compatibility wrappers must remain thin and delegate or re-export only; they must not become the place where new behavior grows.
- Keep TypeScript imports ending in `.js` when importing local TypeScript modules that compile to JavaScript.
- Avoid external-project names, route-era terms, and process vocabulary in product code, filenames, public runtime fields, and user-visible output unless the surface is explicitly historical or compatibility-only.

Detailed rules: [file placement and naming](agent-rules/file-placement-and-naming.md), [compatibility and history](agent-rules/compatibility-and-history.md).

## Validation Summary

- **No Concurrent Heavy Execution (OOM Prevention)**: NEVER run compilation, test, or verification commands (`tsc`, `vitest`, `npm run build*`, `npm run test*`, `npm run verify:*`, `normproof`) concurrently across parallel tool calls, background jobs, or subagents. Concurrent heavy processes trigger the WSL2 Linux OOM-Killer and crash the session.
- **Batch & Fast-Fail Serial Chaining**: Chain sequential checks with `&&`. Run sub-second static gates (`verify:import-cycles`, `check:*`, `verify:docs-drift:strict`) before heavy builds or `vitest` so failures short-circuit immediately. When testing multiple files, pass all target test files into a single `vitest run <fileA> <fileB>` invocation rather than spawning separate `vitest` processes.
- **Subagent Execution Ban**: Delegated subagents (`task`) must NEVER run `build`, `vitest`, or `normproof` mid-flight. Subagents only research or edit their slice; the main agent runs verification serially once after integration.
- Run focused validation tied to the files and behavior changed.
- Do not default to full-repository validation when a focused gate covers the risk.
- If only markdown files change, do not run build/tests (except `npm run verify:docs-drift:strict` when editing rule/index docs).
- Classify failing tests before changing implementation or tests.
- Do not claim validation passed unless the command actually ran and passed.
- Restore audit/history residue before finalizing.
CI enforces these gates, and they exit non-zero on a violation:

- `npm run verify:import-cycles` — dependency cycles. Note it checks cycles only; it does not report imports that fail to resolve.
- `npm run check:config-consumers` — config fields declared with no production reader.
- `npm run check:declarations` — hook events declared with no dispatch site, and tool factories the registry never calls.
- `npm run check:node-floor` — enforces the `engines.node` floor (`>=20.3.0`, which CI runs on). Do not use Node 21/22+ APIs such as `Promise.withResolvers`, `Object.groupBy`, `Map.groupBy`, `Array.fromAsync`, `Set.prototype.union`/`intersection`/`difference`, `Symbol.dispose`, `process.getBuiltinModule`, or `fs.globSync`.
- `npm run verify:docs-drift:strict` — dangling path references in binding rules and current-state docs.
- `npm run test:ts` — the TypeScript suite.
- `npm run test:scripts` — the gates' own tests, so a gate that stops detecting fails here rather than passing quietly.
- `normproof judge` — blocks on the unresolved-specifier obligation only. The cycle and function-ceiling obligations are advisory, so they report without failing the build.

Run the `check:*` and `verify:*` gates locally before pushing; together they take under a second, against roughly three minutes for the suite. Measurements and the gate-by-gate audit are in `.wiki/refactor/plan.md` section 9.27.

Detailed rules: [testing and validation](agent-rules/testing-and-validation.md), [development workflow](agent-rules/development-workflow.md).

## Reference Repositories

Read-only references:

- Claude Code
- codex
- oh-my-pi
- deepseek-harness
- opencode
- OpenHands
- Stagehand
- Playwright MCP
- MemPalace
- mem0
- graphiti
- Inspect AI
- mini-swe-agent
- pi: coding-agent/reference project for agent/runtime architecture comparison; exact useful parts must be determined by targeted inspection when a task needs it.
- GitNexus: coding-agent/reference project for repository intelligence, graph/context, or developer workflow comparison; exact useful parts must be determined by targeted inspection when a task needs it.

Use references only after inspecting the target implementation first, and only for task-relevant semantic comparison. Do not broad-scan references without a direct blocker. Do not mechanically copy implementation code or architecture wholesale. When a reference has already solved the same class of problem, compare its specific decisions against your plan before writing code, and keep a test that fails when a compared decision is reversed.

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

Follow these architectural rules:
1. No dependency cycles. No module may import, directly or transitively, a module that imports it.
2. Every module import resolves within the declared source graph.
3. Responsibility ceiling. No single module may declare more than 20 function-like names — counting named functions, functions or arrows bound to a name, and methods. Split a module that would exceed it rather than letting one module accumulate behaviour.

How these are checked, so you know what will stop you:

| Rule | Gate that catches it | Blocks? |
|---|---|---|
| 1 — cycles | `npm run verify:import-cycles` | yes, in CI |
| 2 — imports resolve | `normproof judge` (unresolved-specifier obligation) | yes, in CI |
| 3 — function ceiling | `npm run analyze:module-facades` | no, advisory |
| 1 — cycles, as a NormProof obligation | `normproof judge` | no, advisory |

Rule 3 has no blocking gate, so a module over the ceiling passes CI. Treat it as a rule to hold yourself to rather than one the pipeline will hold you to.

### Architecture Watch Disposition Protocol

`.normproof/dispositions.md` is where findings that you have reviewed and decided NOT to change get recorded. One line per finding:

```
- <obligation-id> | <finding> | reviewed <date> | decision: fix|defer|ignore | reason: <one line>
```

Rules:
- Recording a disposition NEVER changes the verdict — judge keeps reporting the finding every run.
- If a finding appears repeatedly, first try to fix it; record only when deferring is a real decision.
- Never delete previous disposition lines; append only.
