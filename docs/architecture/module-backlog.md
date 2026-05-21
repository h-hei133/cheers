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

### Route 170: Fenced Replacement Snapshot Recovery

- Route 170 adds the activated exact fenced replacement lane's single-file
  pre-write snapshot receipt, recovery result projection, and explicit rollback
  readiness/apply seam.
- Snapshot capture happens through the existing workspace write route after
  authority/final stale-read and before writer mutation.
- No automatic rollback, broad rollback, fuzzy/discovery/generated/multi-file
  execution, provider/browser calls, schema changes, or CLI redesign is added.

### Route 171: Discovery Edit Manifest

- Route 171 adds a bounded no-write discovery edit manifest with
  `mutationAuthority: not-granted`, candidate path labels, match evidence
  summaries, confidence, confirmation requirement, planned exact fenced
  operation kind, snapshot/verification requirements, and raw-content exclusion.
- Confirmation is explicit and scoped. Unconfirmed, ambiguous, missing-mapping,
  no-candidate, too-many-candidate, fuzzy, generated, broad, and multi-target
  confirmation paths remain stopped/no-write.
- Only `confirmed-single-target` may hand off, and only to the existing exact
  fenced replacement lane, which still performs workspace authority, final
  stale-read, pre-write snapshot capture, writer invocation, post-write
  verification, Result Surface, and Session / Continue projection.

### Route 172: Confirmed Target-Set Edit

- Route 172 adds a bounded confirmed target-set execution lane for discovery
  edits that reduce to exact fenced replacement only.
- The lane uses a strict max 3 file guard, preflights every confirmed target
  before the first mutation, then reuses the existing single-file fenced route
  for per-file workspace authority, final stale-read, snapshot capture, write,
  verification, Result Surface, and continuation-safe evidence.
- Preflight failures remain stopped/no-write. Mid-execution failure reports
  partial-failure facts, changed/failed files, rollback readiness for changed
  files, and no automatic or atomic rollback claim.
- Unconfirmed, over-max, fuzzy, generated, broad, and unsupported target-set
  edits remain stopped/no-write.

### Route 173: Edit Recovery Apply

- Route 173 makes snapshot-backed edit recovery operational through explicit
  rollback apply only.
- Recovery planning consumes known snapshot ids and target paths, checks
  workspace authority and current-content freshness, and keeps plans as
  mutation-authority-not-granted until direct rollback confirmation.
- Single-file rollback apply and bounded target-set subset rollback apply
  restore only snapshot-backed files, run post-rollback verification, report
  success/stopped/failed/partial-failure outcomes, and emit Session /
  Continue-safe evidence without raw content.
- Missing snapshot, missing target, ambiguous target, out-of-workspace target,
  stale target, missing confirmation, unsupported rollback, and no automatic or
  atomic rollback claims remain stopped/no-write.

### Route 174: Target-Set Edit Transaction

- Route 174 hardens confirmed target-set exact fenced replacement with a
  transaction id, safe execution journal, all-target preflight policy,
  verification aggregation, partial-failure changed/failed/unattempted
  separation, and recovery workflow handoff.
- The transaction surface is audit evidence only. It does not add fuzzy,
  generated, broad, or new edit types, and it does not claim true atomic
  multi-file rollback.
- Session / Continue and Result Surface summaries preserve transaction,
  verification, and recovery recommendation facts without raw file content.

### Route 175: Generated Edit Proposal

- Route 175 adds a generated edit proposal lifecycle without direct generated
  mutation.
- Generated prompts can produce a no-write proposal manifest with proposal id,
  target summary, proposed content status, exact mapping readiness,
  confirmation status, verification/snapshot requirements, and
  raw-content-excluded evidence.
- Handoff is allowed only after explicit old/new mapping and exact target
  confirmation, and it reuses the existing fenced or target-set exact lanes for
  workspace authority, stale-read, snapshot/recovery, and verification.
- Provider/model calls, autonomous generation, broad/fuzzy execution,
  unconfirmed mutation, and mutation from proposal alone remain closed.

### Route 176: Provider Edit Proposal

- Route 176 adds provider-backed edit proposal generation behind explicit
  provider availability and deterministic fake-provider tests.
- Provider planning consumes a redacted, budgeted safe edit context packet and
  normalizes output into review-only, exact single-target, exact target-set, or
  unsupported proposal manifests.
- Provider proposals remain no-write with `mutationAuthority: not-granted`;
  exact confirmation only marks handoff readiness for the existing fenced or
  target-set exact lanes, which still own workspace authority, stale-read,
  snapshot/recovery, and verification.
- Default real-provider calls, manual private config reads, provider-generated
  mutation, broad/fuzzy apply loops, CLI/schema/dependency changes, and Result
  Surface bypass remain closed.

### Route 177: Proposal Review And Apply

- Route 177 adds a shared generated/provider proposal review, selection,
  explicit confirmation, and apply bridge.
- Review and selection surfaces are no-write and redacted; reject,
  review-only, invalid selection, non-exact hunks, and unconfirmed selections
  stop before mutation.
- Confirmed exact single-target selections apply only through the existing
  fenced replacement route; confirmed exact target-set selections apply only
  through the existing target-set transaction route.
- No new writer, provider call during apply, fuzzy/broad/generated direct
  mutation, authority/stale-read/snapshot bypass, CLI/schema/dependency
  changes, or broad `runMvpIntegratedFlow.ts` refactor is added.

### Routes 178-179: Proposal Hunk-Set Apply

- Route 178 adds a proposal hunk-set manifest, plan, route, and Result Surface
  projection for confirmed generated/provider proposals whose selected targets
  need distinct exact old/new mappings. Route 179 extends the same hunk-set
  lane to bounded exact multi-hunk-per-file apply.
- The hunk-set route requires explicit confirmation, max 3 files, max 6 hunks,
  max 3 hunks per file, per-hunk exact mapping payloads, workspace authority,
  exact match-count preflight, and conflict/overlap checks for every hunk before
  any mutation.
- Execution reuses the existing fenced replacement lane for one-hunk files and
  uses exact multi-hunk apply for multi-hunk files with deterministic order, one
  pre-write snapshot, one write per file, and post-write verification. It still
  projects target-set transaction id, safe journal, verification aggregation,
  partial-failure changed/failed/unattempted separation, and recovery workflow
  handoff.
- Unconfirmed, non-exact, fuzzy, broad, generated-only, duplicate/conflicting,
  overlapping, ambiguous, and over-max proposal hunks remain stopped/no-write.

### Route 180: Verification Repair Proposal

- Route 180 adds repair proposal generation after failed apply or verification,
  without automatic repair mutation.
- Repair context is redacted and budgeted: failed verification summary,
  failed/changed file labels, failed hunk summaries, runtime receipt markers,
  snapshot/recovery availability, and omitted-content reasons are preserved
  without raw full files, unbudgeted output, provider config, or credentials.
- Repair proposals are review-required and no-write by default. Deterministic
  fake-provider tests cover proposal creation, provider-not-configured,
  opt-in-required, invalid proposal, review-required, and explicit exact
  hunk-set handoff states.
- Confirmed exact repair hunks reuse the existing proposal hunk-set apply route;
  authority, final stale-read, snapshot/recovery, transaction evidence, and
  verification remain owned by that route.
- No provider call during apply, default real-provider call, new writer,
  fuzzy/broad/generated direct mutation, schema/CLI/dependency change, or broad
  `runMvpIntegratedFlow.ts` refactor is added.

### Route 181: Targeted Context Planning

- Route 181 adds deterministic targeted context packets for explicit code
  targets, covering direct imports, sibling files, nearby tests, docs/readme
  references, and bounded textual call-site candidates.
- Context packets are read-only, redacted, budgeted, replay-safe, and
  continuation-safe. They carry selected and omitted candidate summaries,
  missing-context suggested reads, likely test and verification candidates, and
  `mutationAuthority:not-granted`.
- Result Surface and Session / Continue can preserve context packet and plan
  summaries without raw file dumps. Broad edit requests that lack a concrete
  transform can stop with context planning evidence instead of implying write
  readiness.
- No edit expansion, provider/model call, browser work, LSP, embeddings,
  full-repo semantic index, schema/CLI/dependency change, authority bypass, or
  broad `runMvpIntegratedFlow.ts` refactor is added.

### Route 182: Agent Loop Planning Facade

- Route 182 extracts Agent Plan facade modules so context-aware readiness,
  confidence, missing facts, suggested reads, verification candidates, and
  no-write evidence are owned outside `runMvpIntegratedFlow.ts`.
- Route 181 context packets now feed Agent Plan projection for explicit
  read/context prompts and broad edit stops that lack a concrete transform.
  Planning remains deterministic and read-only with
  `mutationAuthority:not-granted`.
- Result Surface and Session / Continue can preserve agent plan summaries
  alongside context packet/plan summaries without raw file content.
- No edit expansion, provider/model call, browser work, autonomous planner,
  hidden chain-of-thought persistence, LSP, embeddings, full-repo semantic
  index, schema/CLI/dependency change, authority bypass, or broad
  `runMvpIntegratedFlow.ts` refactor is added.

### Route 183: Session Result Parity

- Route 183 adds `sessionResultParity.ts` and
  `continuationEvidenceParity.ts` so Session / Continue consumes
  Result Surface-owned blocker vocabulary while preserving safe reason,
  do-next, context packet, agent plan, edit proposal, repair, hunk-set,
  target-set, and recovery summaries across terminal, compact, and continue
  surfaces.
- Approval-denied compact output keeps the denial reason separate from the
  retry/approval do-next guidance, and context/agent-plan/edit stopped evidence
  remains replay-safe without raw file/provider/browser content.
- No product capability, edit execution, provider/model call, browser work,
  approval policy change, session schema change, CLI/dependency change, or
  broad `runMvpIntegratedFlow.ts` refactor is added.

### Route 184: Context-Aware Provider Proposal

- Route 184 adds context-aware provider edit input, prompt, proposal, and
  result facades so targeted context packet ids and Agent Plan readiness,
  confidence, missing facts, suggested reads, and verification candidates can
  feed provider-backed edit proposals.
- Missing context, over-budget context, and needs-more-context Agent Plans stop
  before provider invocation. Provider-facing prompt context remains redacted,
  budgeted, explicit, and no-write.
- Normalized provider proposal manifests can record context packet and Agent
  Plan ids, context confidence/readiness, review requirement, handoff
  readiness, and `mutationAuthority:not-granted`; Session / Continue preserves
  replay-safe proposal/context/plan evidence.
- Default real-provider calls, manual private config reads, mutation from
  proposal, provider calls during apply, fuzzy/broad/generated direct mutation,
  LSP/embedding/full-repo indexing, schema/CLI/dependency changes, and broad
  `runMvpIntegratedFlow.ts` refactors remain closed.

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
| Edit snapshot / rollback substrate | Edit / Patch, Runtime | Route 173 closes explicit snapshot-backed single-file rollback apply and bounded target-set subset recovery apply through recovery plans, guarded restore, verification, Result Surface, Session / Continue, and verifier coverage. | no automatic rollback; no broad/fuzzy/discovery/generated execution; no atomic rollback claim |
| Discovery target-set mutation route | Edit / Patch, Workspace / File Context | Route 174 keeps confirmed target sets limited to exact fenced replacement, max 3 files, and adds transaction id, safe journal, preflight policy, verification aggregation, partial-failure separation, and recovery workflow handoff. | no fuzzy/generated/broad execution; no automatic rollback; no true atomic rollback claim |
| Generated edit proposal lifecycle | Edit / Patch, Result Surface | Route 175 closes no-write generated proposal manifests, review/confirmation projection, exact handoff through existing lanes, continuation evidence, and verifier markers. | no provider/model calls; no autonomous generation; no mutation from proposal alone |
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
