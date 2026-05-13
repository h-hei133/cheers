# Route 18: runtime module ownership map and migration priority plan

This is a development-only Codex goal spec for bounded project work.
It is not a product readiness claim.

## Objective

Create a concrete runtime module ownership map and migration priority plan for:

- packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts
- packages/ts-shell/src/session/SessionManager.ts
- packages/ts-shell/src/entrypoints/cli.tsx

This route is planning-only.

The purpose is to stop ad-hoc helper extraction and replace it with a clear module migration map:

- what each giant file should keep
- what must migrate out
- where each migrated responsibility should live
- migration priority
- local validation after each migration
- batch-level full validation
- stop conditions
- forbidden changes

Output file:

- docs/design/runtime-module-ownership-map.md

## Context

Route 16 created a runtime architecture extraction plan.
Route 17 extracted shellResultAssembly.ts, but the extraction was still relatively small.

The next step should not simply increase or decrease extraction granularity.
The next step should define module ownership and migration order.

Some responsibilities may be small but still belong outside a giant file.
Some responsibilities may be large but too risky to move early.

This plan must distinguish those cases.

## Non-goals

Do not implement migrations in this route.

Do not modify:

- product code
- scripts
- package.json
- default gates
- provider/MCP behavior
- mutation capability
- readiness claims

Do not add:

- broad apply_patch
- 3-file writes
- delete/move
- rollback/atomicity
- external MCP readiness
- default real-provider execution

## Hard constraints

- Follow AGENTS.md.
- RTK command discipline is active.
- Use rtk for reads, search, git status/diff, tests, builds, and large-output commands.
- Do not read, print, copy, grep, parse, modify, or summarize anything under /home/wang/.private-agents-real.
- Do not run full opt-in real-provider mutation execution.
- Do not run arbitrary external MCP servers.
- Do not create commits until final diff, validation results, and proposed commit message are reviewed and approved.

## Required reading

Read:

- AGENTS.md
- PROJECT_STATE.md
- RUNBOOK.md
- docs/design/runtime-architecture-extraction-plan.md
- packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts
- packages/ts-shell/src/orchestration/shellResultAssembly.ts
- packages/ts-shell/src/session/SessionManager.ts
- packages/ts-shell/src/entrypoints/cli.tsx
- packages/ts-shell/src/core/query/resultMapper.ts
- packages/ts-shell/src/core/shell/sessionRuntime.ts
- packages/ts-shell/src/core/shell/sessionStateSurface.ts
- packages/ts-shell/src/core/shell/providerReadiness.ts
- packages/ts-shell/src/orchestration/mutationRoutingProjection.ts
- packages/ts-shell/src/session/compactContinuitySummary.ts
- packages/ts-shell/src/session/stoppedSessionContinuity.ts
- package.json

Use targeted search. Do not dump huge files into the report.

## Required analysis

For each giant file, produce two lists:

### Keep list

Responsibilities that should remain in the giant file after extraction.

For each item:

- responsibility
- why it should stay
- what abstractions it calls
- what it must not grow into

### Migrate list

Responsibilities that should move out.

For each item:

- responsibility
- current source area or function names
- target module name
- target module responsibility
- inputs
- outputs
- side effects
- forbidden responsibilities
- priority: P0 / P1 / P2 / later
- risk: low / medium / high
- local validation command
- batch validation command
- why this migration matters
- what would make it too risky

## Required ownership targets

The plan must explicitly cover these possible migrations and decide keep/migrate/reject:

### runMvpIntegratedFlow.ts

Evaluate:

- shell result assembly
- runtime outcome projection
- provider outcome projection
- tool execution outcome projection
- mutation session handoff
- stopped/failure result projection
- DoNext / next-action projection
- actionable blocker formatting
- provider readiness call boundary
- permission / approval bridge
- query loop control
- runtime trace/debug projection

### SessionManager.ts

Evaluate:

- session project binding
- session replay builder
- current session selection
- compact retention planner
- compact summary builder
- stopped-session resume context
- mutation continuity state
- plannedFiles continuity state
- approval context persistence
- session persistence gateway
- history compaction
- cleanup/durability behavior

### cli.tsx

Evaluate:

- CLI arg parsing
- mode dispatch
- print mode runner
- stdin mode runner
- interactive bootstrap
- slash command registry
- continue command bridge
- approval prompt bridge
- provider readiness display
- session selection bridge
- runtime invocation
- terminal result display
- startup/environment bootstrap

## Required migration batches

Group migrations into batches.

Each batch must include:

- batch name
- goal
- migrations included
- why these belong together
- allowed files
- forbidden files
- local validation after each migration
- full validation after batch
- success criteria
- failure criteria
- rollback plan
- stop conditions

Expected batches may include:

1. runMvpIntegratedFlow result/outcome/handoff batch
2. SessionManager compact/replay/continuity batch
3. cli.tsx mode/command/approval surface batch

But adjust based on evidence.

## Required prioritization

Produce a ranked list of at least 12 migration candidates.

For each candidate:

- rank
- source file
- target module
- why this priority
- expected maintainability impact
- expected risk
- local validation
- batch validation

The ranking must not simply be by line count.
Prioritize by:

- risk reduction
- responsibility clarity
- likelihood of stable tests
- future change isolation
- avoiding capability expansion
- avoiding high-risk behavior changes too early

## Required validation strategy

The plan must distinguish:

### Local validation

Run after each individual migration.

Examples:

- focused unit test for new module
- type/build check
- result contract
- one route-specific verifier

### Batch validation

Run after completing a group of related migrations.

Examples:

- candidate mutation suite
- planned-files continuity
- session durability
- CLI evidence
- release deterministic

### Full validation

Run before final commit of an implementation route.

Examples:

- build
- result contract
- route evidence commands
- release deterministic
- git diff --check

## Required output structure

The plan file must contain:

1. Executive summary
2. Why module ownership is now required
3. Current giant-file responsibility boundaries
4. Keep lists
5. Migrate lists
6. Target module map
7. Migration priority table
8. Migration batches
9. Local validation strategy
10. Batch validation strategy
11. Full validation strategy
12. Stop conditions
13. What must not change
14. First recommended migration
15. Second and third recommended migrations
16. Definition of success for architecture maintainability 4/5
17. Appendix: commands run and results

## Required baseline validation

Run:

- rtk git status --short --branch
- rtk npm run verify:real-user-capabilities -- --suite=candidate-mutation
- rtk npm run verify:real-user-capabilities:planned-files-continuity
- rtk npm run verify:session-durability:long
- rtk npm run verify:result-contract
- rtk npm run build -w packages/ts-shell
- rtk npm run verify:release:deterministic
- rtk git diff --check
- rtk git status --short --branch

Do not run full opt-in real-provider execution.

## Allowed files

Allowed:

- docs/design/runtime-module-ownership-map.md
- optionally RUNBOOK.md or PROJECT_STATE.md only to link to the plan

Prefer only the plan file.

## Forbidden files

Do not modify:

- packages/ts-shell/**
- scripts/**
- package.json
- default gates
- product behavior

## Success criteria

Route 18 is complete only if:

- docs/design/runtime-module-ownership-map.md exists
- it clearly says what stays and what moves for all three giant files
- it ranks at least 12 migration candidates
- it groups migrations into batches
- it defines local, batch, and full validation
- it recommends exactly one first migration
- it does not recommend broad rewrite
- it does not recommend capability expansion
- required baseline validation passes or failures are classified
- no product code is modified
- no default gates are modified

## Final report

Report:

1. Route
2. Objective
3. Plan file created
4. Files changed
5. Product code touched? yes/no
6. Capability expanded? yes/no
7. Default gates changed? yes/no
8. First recommended migration
9. Top three migration priorities
10. Validation commands and results
11. Residue cleanup status
12. Proposed commit message

## Commit policy

Do not commit or push.
Propose a commit message only.
