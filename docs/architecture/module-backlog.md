# Module Backlog

Route: `docs/agent-routes/route149-module-roadmap-reset.md`

This backlog is now module-first. It records completed consolidation work and
candidate route families; it is not a fixed feature queue.

Use the active context policy before starting a route:

- Read `docs/ACTIVE_CONTEXT.md` first.
- Use `docs/DOC_STATUS.md` to choose only route-relevant docs.
- Read `docs/agent-routes/module-route-template.md` when drafting or executing
  a module route.
- Read implementation-context, foundation, module-reference, or historical docs
  only when the active route needs that context.

Every future route must name its owner module, lifecycle stage, cross-module
inputs and outputs, product behavior boundary, validation gate, and stop
conditions before implementation.

When a route wires a capability path, consult `docs/implementation-context/`
for the current owner module, public facade, handoff, forbidden shortcut, and
focused validation context. Treat it as route-start implementation context, not
as an import-policing rule.

## Completed Consolidation Routes

### Routes 135-136: Verifier Decomposition And Atlas

- Route 135 decomposed the real-user capability verifier behind a compatibility
  entrypoint while preserving flags, markers, report fields, exit codes,
  redaction, dry-run, dirty-repo guard, and real-provider opt-in behavior.
- Route 136 consolidated the control-plane atlas and module ledgers, naming
  Agent Loop, CLI / UX, Session / Continue, Permission / Policy, Result
  Surface, Provider / Model, Tool, Runtime, and Harness / Eval ownership.

### Routes 137-139: Agent Loop Baseline And Dispatch

- Route 137 extracted flow result/evidence projection helpers from
  `runMvpIntegratedFlow.ts`.
- Route 138 repaired the streamed-result handoff/tool-approval baseline and
  extracted `flowDispatch.ts`.
- Route 139 swept focused and broad control-plane baselines, repaired command
  intent drift, and classified remaining broad runMvp failures before further
  extraction.

### Routes 140-142: Read, Verification, And Continuation Contracts

- Route 140 defined read/list/inspect/repo-explain no-write contracts and
  added focused owners for read intent, continuation target, and repo-explain
  evidence.
- Route 141 moved verification selection, retry, skipped/not-requested, and
  command verification projection into named helpers.
- Route 142 extracted continuation, lineage, rebase, and projection helpers
  while preserving session schema and provider/browser/edit boundaries.

### Routes 143-144: Edit Expectation And Green Baseline

- Route 143 defined current bounded write/edit expectations and moved broad
  refactor, batch edit, discovery edit, and vague generated-content success
  expectations into future capability routes.
- Route 144 closed the remaining full `runMvpIntegratedFlow.test.ts` failures
  and swept the `packages/ts-shell` package baseline green.

### Routes 145-147: Substrate And Contract Unification

- Route 145 extracted Session / Continue substrate seams without schema,
  transcript, compact, CLI, provider, browser, edit, dependency, or broad
  runMvp changes.
- Route 146 introduced the Tool / Policy / Result receipt vocabulary and
  transcript-safe projection helpers.
- Route 147 defined future edit expansion contracts for broad refactor,
  multi-file discovery edit, and broader fenced replacement without enabling
  broad edit execution.

### Route 148: Edit / Patch Module Boundary

- Route 148 added an Edit / Patch module facade over current and future edit
  helpers, plus module-owned manifest, preview/evidence, precondition, and
  result projection helpers.
- Current bounded write/edit execution remains delegated to existing routes.
- Broad refactor, multi-file discovery edit, broader fenced replacement, and
  rollback/snapshot remain preview/precondition states, not executable paths.

### Route 149: Module Roadmap Reset

- Route 149 resets the next-roadmap decision around module ownership, lifecycle
  stage, risk, and product value.
- It removes the stale implication that Edit / Patch must continue next merely
  because Routes 147-148 discussed edit contracts.
- It adds `docs/architecture/module-roadmap-reset.md` as the module status and
  phase-ordering source for the next planning cycle.

### Route 150: Runtime Receipt Contract

- Route 150 adds `core/runtime/runtimeReceipt.ts` and
  `core/runtime/runtimeReceiptProjection.ts` as the Runtime-owned receipt seam
  over Route 146 Tool / Policy / Result vocabulary.
- Existing command, sandbox escalation/denial, browser runtime status/cleanup,
  and MCP process/protocol failure paths attach projected receipt metadata
  without changing execution behavior, CLI output, schema, browser/edit/provider
  capability, Rust protocol, or dependencies.
- `docs/architecture/runtime-receipt-contract.md` records the field contract,
  lifecycle mapping, redaction rules, integrated call sites, and validation
  gate.

### Route 160: ResultMapper Result Surface Facades

- Route 160 adds `core/query/actionableBlockerModule.ts`,
  `core/query/terminalClassificationProjection.ts`, and
  `core/query/capabilityResultClassification.ts` as Result Surface-owned
  facades for actionable blockers, terminal fallback labels, and capability
  hard-failure/caveat classification.
- `resultMapper.ts` remains the final truthfulness composition root for the
  top-level `OrchestrationResult` shape and completed/stopped/error decision
  order.
- `docs/architecture/resultmapper-module-extraction.md` records the
  responsibility migration table and final ownership classification.

### Route 162: Cross-Capability Result Flow Calibration

- Route 162 starts vertical stopped/result calibration after the central-file
  pass and implementation-context pack.
- Provider not-configured/opt-in/unsupported readiness facts, browser
  unavailable/policy/timeout/cleanup facts, and edit missing-target,
  missing-content, stale-read, and unsupported-future-edit facts now have
  capability-specific Result Surface markers where the current code already
  supplies safe facts.
- The route preserves capability-specific flows and does not add a global
  handoff abstraction, provider calls, browser actions, edit writes, session
  schema changes, CLI behavior, dependencies, or default gate changes.
- `docs/architecture/cross-capability-result-flow.md` records the before/after
  flow summary, touched facades, result states preserved, and validation
  surface.

### Route 163: Foundation Consistency Audit

- Route 163 adds `docs/foundation/` with a concise audit, machine-readable
  consistency matrix, and risk register over result truthfulness, runtime
  receipts, workspace/edit preconditions, browser cleanup, provider readiness,
  session/continue, CLI surfaces, and verifier reports.
- The audit finds no blocking foundation contradiction and makes no source,
  package, provider, browser, edit, runtime, CLI, session-schema, dependency,
  package-script, or global handoff changes.
- The main high-risk contradiction is marker parity between Result Surface
  truthfulness and Session terminal blocker detail rendering: new Route 162
  markers are terminal-truthful in `resultMapper`, but the session terminal
  blocker detail classifier still recognizes only the older subset.
- The best follow-up is a focused Result Surface / Session terminal surface
  parity route; `Harness / gate taxonomy` remains the best release/report
  confidence route.

### Route 164: Session Terminal Blocker Detail Parity

- Route 164 resolves the Route 163 high-risk foundation drift by making
  `sessionTerminalState.ts` consume the shared Result Surface blocker
  classification from `actionableBlockerModule.ts` for terminal blocker-detail
  rendering.
- Provider not-configured / opt-in / unsupported markers, browser policy /
  unavailable / timeout / cleanup markers, and edit missing-content /
  unsupported-future-edit / stale-read style markers now share the Result
  Surface blocker vocabulary used by `resultMapper`.
- The route preserves result truthfulness, completed/stopped/error semantics,
  provider/browser/edit capability scope, workspace/stale-read behavior,
  session schema, dependencies, package scripts, and default gates.
- `docs/foundation/` was updated to mark the blocker-detail parity risk as
  resolved.

### Route 165: Tool / Runtime Execution Flow Calibration

- Route 165 aligns the existing command execution path by projecting the
  already budgeted `metadata.runtimeReceipt` into stable
  `runtime-receipt-*` evidence markers for run-command and verification
  results.
- Command success, nonzero failure, timeout/cancel receipt projection,
  allowlist blocked, approval-denied, unavailable, and stdout/stderr budgeting
  remain covered by focused Tool, Runtime, Result Surface, and Session tests.
- The route preserves command allowlists, sandbox/approval decisions, runtime
  execution semantics, Result Surface truthfulness, session schema, CLI
  behavior, provider/browser/edit scope, dependencies, package scripts, and
  default gates.
- `docs/architecture/tool-runtime-execution-flow.md` records the calibrated
  flow and validation surface.

### Route 166: Docs Active Context Map

- Route 166 adds `docs/ACTIVE_CONTEXT.md`, `docs/DOC_STATUS.md`, and
  `docs/archive/README.md` so future routes start from a concise documentation
  entrypoint and status map instead of loading all route history.
- Documentation is classified as active, implementation-context,
  foundation-evidence, module-reference, historical, superseded, or archived.
- Future route prompts should use the active context policy, explain why each
  selected doc is needed, and avoid default reading of old extraction docs,
  route closeouts, or broad design directories.
- This route is documentation-only and does not change product code, package
  scripts, dependencies, behavior, provider gates, browser scope, edit scope,
  runtime behavior, or validation scripts.

### Route 167: Bounded Fenced Replacement

- Route 167 adds an Edit / Patch-owned exact fenced replacement lane for one
  explicit in-workspace target and one exact old/new fenced mapping.
- The lane plans an apply_patch update only after one exact match, then delegates
  execution to the existing workspace write route for workspace authority, final
  stale-read, writer invocation, and post-write verification.
- Result projection records fenced replacement as success or stopped without raw
  file content, and continuation evidence carries only target, operation,
  changed/stopped state, blocker, verification, and safe markers.
- Broad/fuzzy replacement, discovery edit, generated-content edit, multi-file
  edit, rollback/snapshot execution, provider/browser calls, schema changes,
  CLI redesign, dependencies, and broad runMvp refactor remain closed.

### Route 168: Fenced Replacement Activation

- Route 168 makes the Route 167 lane reachable from normal prompt / CLI /
  Agent Loop selection for one explicit target and one exact old/new fenced
  mapping.
- Agent Loop only selects and delegates; exact mapping, workspace authority,
  final stale-read, writer invocation, post-write verification, result
  projection, and continuation-safe evidence remain owned by Edit / Patch and
  existing write/result surfaces.
- CLI routing keeps explicit replacement prompts on the orchestrated path so
  success and stopped outcomes are visible through the normal user-facing
  stream.
- Unsupported fuzzy, discovery, broad/multi-region, generated-content, and
  rollback/snapshot fenced requests remain stopped before mutation.

### Route 169: Edit Activation Closeout Gate

- Route 169 hardens the activated exact fenced replacement lane without adding
  edit power.
- `fencedEditOutcome.ts` owns the stable success/stopped/failed taxonomy and
  emits markers for success, missing target, missing mapping, no match,
  multiple matches, stale-read, unsupported fuzzy/discovery/generated/multi-file
  requests, writer failure, and verification failure.
- Result Surface remains the terminal truthfulness root: supported success is
  completed/success, pre-mutation blockers are stopped/no-write, and
  writer-started or post-write verification failures remain error-classified.
- Session / Continue consumes replay-safe evidence only; raw old/new fenced
  content, full file content, provider paths, and secrets remain excluded.
- The focused edit closeout gate now includes the fenced outcome tests and
  emits explicit activated-lane report markers for reachability, no-write
  stopped paths, continuation safety, raw-content exclusion, and
  result-contract compatibility.

## Module-First Route Rule

Future routes must state:

- owning module
- lifecycle stage touched
- cross-module inputs
- cross-module outputs
- product behavior boundary
- validation gate
- stop conditions

Feature work is allowed only when it enters through a module-owned contract.
Edit expansion enters through Edit / Patch; browser planner work enters through
Browser; provider readiness enters through Provider / Model; CLI work enters
through CLI / UX.

## Candidate Route Families

### Phase A: Control-Plane Kernel Hardening

Recommended when reducing cross-module coupling is more valuable than adding
capability scope.

| Candidate | Primary module | Goal | Validation shape |
|---|---|---|---|
| Agent Loop dispatch extraction v2 | Agent Loop | Route 152 added `turnCapabilityPlan`, `turnReceiptAggregation`, and `turnKernel` to centralize turn summary, receipt aggregation, and final result handoff while preserving behavior. | closed by Route 152; focused turn/adjacent tests, runMvp, edit closeout, result-contract, build |
| Agent Loop module facade extraction | Agent Loop, Workspace / File Context, Session / Continue, Result Surface / Verification | Route 154 added `readInspectModule`, `verificationModule`, and `continuationModule` facades so `runMvpIntegratedFlow.ts` consumes stable module entrypoints for those clusters while preserving behavior. | closed by Route 154; facade/adjacent tests, runMvp, edit closeout/result-contract because result/evidence and workspace/edit-adjacent surfaces were touched, build |
| Agent Loop execution/result facade extraction | Agent Loop, Browser, Tool, Runtime, Provider / Model, Result Surface | Route 155 added `browserModule`, `toolRuntimeModule`, `providerModule`, and `resultSurfaceModule` so `runMvpIntegratedFlow.ts` no longer owns selected browser/tool/provider/result handoff details directly. | closed by Route 155; execution-boundary facade tests, adjacent tool/provider/result tests, runMvp, result-contract, build |
| Agent Loop receipt-consumer thin wiring | Agent Loop, Runtime, Result Surface | Adopt Runtime Receipt projection at one existing result/session handoff without changing truthfulness or schema. | focused receipt/runMvp/result-contract tests |
| Workspace / File Context contract | Workspace / File Context, Edit / Patch | Route 151 added `workspaceFileContract` and `workspaceTargetProjection` as shared vocabulary for root, target, read/write authority, stale-read, verification preconditions, continuation, and future discovery summaries without changing authority or execution. | closed by Route 151; focused workspace/adjacent tests, runMvp, edit closeout, result-contract, build |
| CLI / core split preparation | CLI / UX, Session / Continue | Route 153 added startup, session, provider, and display projection helpers while preserving CLI flags, slash semantics, session/schema behavior, provider gates, runtime invocation, and result surfaces. | closed by Route 153; focused CLI/slash/baseline tests and build |
| CLI module facade extraction | CLI / UX, Session / Continue, Permission / Policy, Provider / Model, Workspace / File Context, Agent Loop | Route 158 added `cliApprovalModule`, `cliRuntimeModule`, `cliSessionModule`, `cliWorkspaceModule`, and `cliPermissionModule` so `cli.tsx` remains the process entrypoint while module-owned facades own approval, runtime turn handoff, session, workspace, and permission surfaces. | closed by Route 158; focused CLI facade/adjacent tests, CLI baseline, runMvp, build |
| Real-user verifier module facade extraction | Harness / Eval, Provider / Model, Result Surface | Route 159 kept `scripts/verify-real-user-capabilities.mjs` as a thin compatibility entrypoint and added `verifierCliModule`, `verifierCaseModule`, `verifierSafetyModule`, and `verifierReportModule` so `scripts/verify/index.mjs` remains the Harness readiness composition root while module-owned facades own options, case planning, opt-in safety, and report construction. | closed by Route 159; node checks, verifier boundary self-test, real-user verifier tier/suite/dry-run/include-real dry-run gates, edit closeout, result-contract |
| ResultMapper Result Surface facade extraction | Result Surface, Tool, Runtime, Edit / Patch, Browser, Provider / Model, Session / Continue | Route 160 added actionable blocker, terminal classification, and capability result classification facades so `resultMapper.ts` remains the final truthfulness composition root while Result Surface-owned modules own blocker marker parsing, fallback labels, and hard-failure/caveat classification. | closed by Route 160; resultMapper boundary tests, existing resultMapper tests, result-contract, build |
| Cross-capability result-flow calibration | Result Surface, Provider / Model, Browser, Edit / Patch, Runtime, Harness / Eval | Route 162 calibrated three low-risk stopped/result flows through capability-specific markers and focused tests without adding a global handoff abstraction or execution capability. | closed by Route 162; cross-capability result-flow test, provider/browser/edit/result focused tests, result-contract, edit closeout, build |
| Session runtime module facade extraction | Session / Continue, Result Surface, Agent Loop | Route 156 added `sessionEventSurface`, `sessionTerminalState`, `sessionPersistenceProjection`, and `sessionFutureTurnProjection` so `sessionRuntime.ts` keeps event order and coordination while module-owned facades own rendering, terminal accumulation, persistence payload projection, and future-turn projection. | closed by Route 156; focused sessionRuntime boundary/runtime tests, runMvp, result-contract, build |
| SessionManager module facade extraction | Session / Continue, Permission / Policy, CLI / UX | Route 157 added `sessionStore`, `sessionRegistry`, `sessionApprovalMemoryModule`, `sessionCompactModule`, and `sessionContinuityModule` so `SessionManager.ts` remains the stateful substrate while module-owned facades own layout, current-session registry, approval-memory, compact-retention, and continuity evidence details. | closed by Route 157; focused session boundary/adjacent tests, sessionRuntime tests, runMvp, build |

### Phase B: Capability Module Expansion

Recommended only when the owning module already defines inputs, outputs,
preconditions, result projection, and validation.

| Candidate | Primary module | Goal | Stop condition |
|---|---|---|---|
| Edit / Patch thin integration | Edit / Patch, Result Surface | Adopt the module facade at one thin classification/projection handoff. | no new write execution |
| Edit snapshot / rollback substrate | Edit / Patch, Runtime | Route 170 substrate now exists for activated exact fenced replacement: pre-write snapshot receipt, rollback readiness, dry-run rollback plan, and explicit single-file apply seam. | no automatic rollback; no broad/fuzzy/discovery/generated/multi-file execution |
| Multi-file discovery candidate selection | Edit / Patch, Workspace / File Context | Produce bounded candidate sets and confirmation requirements. | no mutation by discovery |
| Browser controlled planner v2 | Browser, Agent Loop | Improve controlled planner contracts only if browser becomes product priority. | no public web or default browser action expansion |

### Phase C: Gate And Release Architecture

Recommended when confidence, reporting, or release-readiness truthfulness is the
blocker.

| Candidate | Primary module | Goal | Validation shape |
|---|---|---|---|
| Harness / gate taxonomy | Harness / Eval | Classify gates as product path, deterministic, opt-in real, dry-run, self-test, docs-only, or report-only. | diff/status plus touched verifier self-tests |
| Eval report schema | Harness / Eval, Result Surface | Normalize report fields and markers without changing product routes. | report self-tests and result-contract where relevant |
| Provider readiness parity | Provider / Model, Harness | Align runtime provider classification with readiness scripts and default-skip behavior. | classification self-test; real-provider live gate only by explicit opt-in |
| Capability lifecycle adoption report | Capability Contract Architecture | Audit which modules implement lifecycle stages and where gaps remain. | docs-only diff/status |

## Decision Criteria

Choose the next route by evidence, not route number:

- Which module owns the highest current coupling or user-facing risk?
- Which lifecycle stage is missing, duplicated, or too close to a large file?
- Which runtime path, result surface, or gate improves?
- Which focused validation already exists or can be added narrowly?
- Which stop condition prevents provider/browser/edit/schema/CLI/dependency
  expansion?

If these answers are weak, pick a contract route instead of a feature route.

## Current Default Recommendation

The central-file extraction pass is complete for the current atlas set, and
Route 163 records the current foundation consistency state in
`docs/foundation/`, Route 164 resolves its high-risk session terminal
blocker-detail parity drift, and Route 165 calibrates the existing Tool /
Runtime command receipt evidence path. Routes 154-160 classify
`runMvpIntegratedFlow.ts`, `sessionRuntime.ts`, `SessionManager.ts`, `cli.tsx`,
`scripts/verify/index.mjs`, and `resultMapper.ts` as acceptable
composition/substrate/readiness/truthfulness roots under owner-module
boundaries.

Choose the next route by module lifecycle gap and product risk rather than by
central-file size. After Route 167, choose `Harness / gate taxonomy` if
release/report confidence is the blocker. Consider the next bounded product
capability only after the active context policy identifies the relevant module
docs and validation surface. Consider shared handoff extraction only after more
capability-specific flows prove repeated stable fields.

## Persistent Boundaries

Do not use this backlog to justify broad source refactors. A route is valid
only when it reduces a user-facing runtime blocker or a named cross-layer
concentration point with focused evidence.

Unless a route explicitly opens the boundary, do not add provider behavior,
read or print real-provider config, expand browser execution, broaden edit
execution, change schemas, change CLI behavior, change dependencies, or change
default gates.
