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

## Non-Negotiable Safety

- Do not manually read, print, copy, summarize, clean, or modify real provider configuration under `/home/wang/.private-agents-real`.
- Use real provider configuration only through explicit opt-in gates that preserve isolated runtime homes, redaction, clean repository status, and precise failure attribution.
- Do not infer write authorization from prompt text.
- Keep dry-run, preview, permission-pending, denied, blocked, approved-for-write, and write-success states distinct.
- Do not hide unverified write outcomes behind success-like terminal or session states.
- Do not change unrelated runtime code.
- Provider/auth core, release/default gates, package scripts, and build behavior require explicit task scope.

Detailed rules: [provider and secret boundary](agent-rules/provider-and-secret-boundary.md), [evidence and truthfulness](agent-rules/evidence-and-truthfulness.md).

## Architecture Summary

- TypeScript is the primary product runtime and control plane: shell, session, orchestration, query loop, slash commands, permission UX, recovery, replay, runtime durability, result mapping, terminal/session surface, high-level capability routing, and most current execution adapters.
- Execution is an explicit runtime boundary/interface implemented in `packages/ts-shell/src/` (see `core/tools/`, `tools/`, `sandbox/`, and the `browser/*Executor.ts` adapters). A Rust daemon path exists under `packages/rust-core/`, reached through `src/daemon/`; it is not the default execution plane.
- Rust is a future native executor candidate for OS/process/sandbox/isolation/distribution-critical responsibilities; do not claim Rust owns current execution unless the code path proves it.
- `contracts` carries schemas, events, lifecycle states, permission semantics, and serialization rules only when there is a real cross-runtime consumer.
- `packages/python-eval/` is isolated offline benchmark evaluation only, not a production workspace member.
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

- Run focused validation tied to the files and behavior changed.
- Do not default to full-repository validation when a focused gate covers the risk.
- If only markdown files change, do not run build/tests.
- Classify failing tests before changing implementation or tests.
- Do not claim validation passed unless the command actually ran and passed.
- Restore audit/history residue before finalizing.

CI enforces these gates, and they exit non-zero on a violation:

- `npm run verify:import-cycles` — dependency cycles. Note it checks cycles only; it does not report imports that fail to resolve.
- `npm run check:config-consumers` — config fields declared with no production reader.
- `npm run check:declarations` — hook events declared with no dispatch site, and tool factories the registry never calls.
- `npm run verify:docs-drift:strict` — dangling path references in binding rules and current-state docs.
- `npm run test:ts` — the TypeScript suite.
- `npm run test:scripts` — the gates' own tests, so a gate that stops detecting fails here rather than passing quietly.
- `normproof judge` — blocks on the unresolved-specifier obligation only. The cycle and function-ceiling obligations are advisory, so they report without failing the build.

Run the `check:*` and `verify:*` gates locally before pushing; together they take under a second, against roughly three minutes for the suite. Measurements and the gate-by-gate audit are in `.wiki/refactor/plan.md` section 9.27.

Detailed rules: [testing and validation](agent-rules/testing-and-validation.md), [development workflow](agent-rules/development-workflow.md).

## Reference Repositories

Read-only references:

- Claude Code
- opencode
- Gemini CLI
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

Use references only after inspecting the target implementation first, and only for task-relevant semantic comparison. Do not broad-scan references without a direct blocker. Do not mechanically copy implementation code or architecture wholesale.

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
