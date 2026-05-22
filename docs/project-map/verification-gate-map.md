# Verification Gate Map

## Focused Unit Tests

- What it proves: local module contracts for selected TypeScript files.
- What it does not prove: broad runtime integration or live provider behavior.
- Calls provider: no, unless a specific opt-in real test is run outside default.
- Can mutate workspace: usually isolated fixtures only.
- Verifies apply: only for focused edit/apply route tests.
- Verifies verification: only where test targets include verification modules.
- Evidence type: `focused-unit-tests`.
- Known false-complete risk: passing local tests can mask Agent Loop/CLI/session integration drift.

## `scripts/verify-context-planning.mjs`

- What it proves: context packet, context graph, code graph, task lifecycle, analysis, Agent Plan, Plan Quality, provider proposal gates, verification/repair planning, session parity focused coverage.
- What it does not prove: live provider execution, mutation, broad semantic code understanding.
- Calls provider: no; sets synthetic provider mode.
- Can mutate workspace: no product workspace mutation.
- Verifies apply: no.
- Verifies verification: verifies planning/receipt contracts, not live user verification.
- Evidence type: `focused-unit-tests`.
- Known false-complete risk: context and plan readiness can be mistaken for execution readiness.

## `scripts/verify-edit-capability-closeout.mjs`

- What it proves: focused edit/apply/proposal/snapshot/recovery/repair contracts and markers.
- What it does not prove: arbitrary project mutation, broad/fuzzy apply_patch, default real-provider mutation, external release readiness.
- Calls provider: no real provider; fake/stub provider surfaces only.
- Can mutate workspace: isolated/focused tests may mutate fixtures.
- Verifies apply: yes for focused bounded routes.
- Verifies verification: yes for route-specific readback/verification projections.
- Evidence type: `focused-unit-tests` / `fake-provider`.
- Known false-complete risk: "covered" report fields are not broad product readiness.

## `rtk npm run verify:result-contract`

- What it proves: result mapper terminal contract tests and synthetic CLI print/replay result markers for selected scenarios.
- What it does not prove: every capability branch maps truthfully.
- Calls provider: no; uses synthetic mode.
- Can mutate workspace: creates synthetic fixture under test root; no product code mutation.
- Verifies apply: no write in result-contract fixture.
- Verifies verification: result markers for selected read scenario and focused result tests.
- Evidence type: `focused-unit-tests`.
- Known false-complete risk: result surface can still drift in branches not covered by the gate.

## Build

- What it proves: TypeScript/package compilation succeeds for selected workspace.
- What it does not prove: runtime behavior, provider behavior, session truthfulness.
- Calls provider: no.
- Can mutate workspace: build artifacts may be produced according to package behavior; no product logic change.
- Verifies apply: no.
- Verifies verification: no.
- Evidence type: `focused-unit-tests` support / build contract.
- Known false-complete risk: build green says nothing about capability closure.

## Diff Check

- What it proves: no whitespace/conflict-marker errors in git diff.
- What it does not prove: functional correctness.
- Calls provider: no.
- Can mutate workspace: no.
- Verifies apply: no.
- Verifies verification: no.
- Evidence type: default-safe local hygiene.
- Known false-complete risk: clean diff can still contain wrong docs or code.

## Package Guard

- What it proves: package files were not unexpectedly changed when a route requires no dependency/script changes.
- What it does not prove: runtime correctness.
- Calls provider: no.
- Can mutate workspace: no.
- Verifies apply: no.
- Verifies verification: no.
- Evidence type: default-safe local hygiene.
- Known false-complete risk: product code can still drift without package changes.

## Audit Residue Guard

- What it proves: verifier or route did not leave known audit/history/temp residue, or residue was reported.
- What it does not prove: behavioral correctness.
- Calls provider: no by itself.
- Can mutate workspace: cleanup can remove generated residue; Route 201 validation does not require provider/browser/task-loop gates.
- Verifies apply: no.
- Verifies verification: no.
- Evidence type: cleanup evidence.
- Known false-complete risk: unknown residue paths may be missed.

## `scripts/verify-real-provider-readiness-smoke.mjs`

- What it proves: default skip safety, opt-in readiness classification, redaction, and provider readiness taxonomy when run under allowed modes.
- What it does not prove: provider can complete a coding task.
- Calls provider: default no; opt-in can call provider readiness endpoint.
- Can mutate workspace: no product workspace mutation; may use isolated test roots.
- Verifies apply: no.
- Verifies verification: no.
- Evidence type: `default-safe-skip`; opt-in live readiness is outside Route 201 execution.
- Known false-complete risk: readiness pass is not coding-task success.

## `scripts/verify-real-provider-anchored-smoke.mjs`

- What it proves: default skip safety, fake-ready boundary, focused tests, and under Route 199 user-observed opt-in, live provider-called exact-ready no-write anchored smoke.
- What it does not prove: workspace apply or verification.
- Calls provider: default no; Route 199 user-observed live opt-in yes.
- Can mutate workspace: no; no-write route.
- Verifies apply: no.
- Verifies verification: no post-apply verification.
- Evidence type: `live-provider-called` for Route 199, `default-safe-skip` by default, `fake-ready-boundary` for fake-ready.
- Known false-complete risk: exact-ready no-write can be misread as applied.

## `scripts/verify-real-provider-task-loop-mvp.mjs`

- What it proves: task-loop runner and result/scorecard surface can report provider/apply/verification states; Route 200 observed state is stopped.
- What it does not prove: live provider-called task-loop, apply, or verification in the observed Route 200 state.
- Calls provider: Route 200 observed no; default no.
- Can mutate workspace: only controlled fixture if confirmation/apply path actually runs; Route 200 observed apply not-run.
- Verifies apply: Route 200 observed no.
- Verifies verification: Route 200 observed no.
- Evidence type: `live-provider-no-write` stopped / `default-safe-skip`; not live task-loop success.
- Known false-complete risk: script name says MVP but observed evidence is `provider-called=false`, `apply=not-run`, `verification=not-run`.

## `scripts/verify-release-deterministic.mjs`

- What it proves: deterministic meta gate executes selected build/CLI/release/core/MVP/candidate/default-skip sub-gates and asserts markers such as `realProviderTouched=false`, `candidateMutationRealExecuted=false`, `externalMcpServerUsed=false`, `broadReleaseReady=false`.
- What it does not prove: broad release or live provider task-loop readiness.
- Calls provider: no; clears real-provider opt-in env.
- Can mutate workspace: isolated fixtures only through sub-gates.
- Verifies apply: synthetic bounded cases only.
- Verifies verification: deterministic bounded cases only.
- Evidence type: deterministic/default-safe.
- Known false-complete risk: deterministic release-candidate ready is not broad/general release ready.

## `scripts/verify-mcp-local-execution.mjs`

- What it proves: local deterministic MCP execution fixture behavior.
- What it does not prove: external/user-configured MCP server readiness.
- Calls provider: no.
- Can mutate workspace: no product workspace mutation.
- Verifies apply: no.
- Verifies verification: no.
- Evidence type: focused/local deterministic.
- Known false-complete risk: local MCP fixture can be mislabeled as external MCP support.

## `scripts/verify-mcp-error-taxonomy.mjs`

- What it proves: MCP failure classes and safe detail redaction.
- What it does not prove: external MCP transport reliability.
- Calls provider: no.
- Can mutate workspace: no product workspace mutation.
- Verifies apply: no.
- Verifies verification: no.
- Evidence type: focused-unit-tests.
- Known false-complete risk: taxonomy coverage is not external integration readiness.
