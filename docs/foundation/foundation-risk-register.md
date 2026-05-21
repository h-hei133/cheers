# Foundation Risk Register

Route: `docs/agent-routes/route163-foundation-consistency-audit.md`

## Blocking

None found in this audit. Terminal truthfulness, no-write edit preconditions,
runtime redaction, provider readiness redaction, and verifier dry-run safety all
have focused evidence.

## High

None open after Route 165.

## Resolved

### Target-set edit transaction evidence

- Affected modules: Edit / Patch, Workspace / File Context, Result Surface,
  Session / Continue, Harness / Eval.
- Why it was a calibration gap: Route 172 separated preflight and per-file
  execution, and Route 173 added explicit recovery apply, but target-set edits
  still lacked one transaction-level audit surface for journaled steps,
  verification aggregation, partial-failure separation, and recovery handoff.
- Resolution: Route 174 adds `targetSetEditTransaction.ts`,
  `targetSetEditJournal.ts`, `targetSetEditPolicy.ts`,
  `targetSetEditVerification.ts`, and `targetSetEditRecoveryWorkflow.ts` to
  project transaction ids, safe journals, preflight atomicity, verification
  aggregates, changed/failed/unattempted separation, and explicit recovery
  workflow guidance without changing the exact fenced replacement lane.
- Evidence: target-set transaction/journal/policy/verification/recovery
  workflow tests, target-set route/result/session regressions, and edit
  closeout verifier markers.
- Recommended next action: keep broader edit types, automatic rollback, and
  true atomic multi-file rollback closed until a dedicated route defines them.
- Should become a route: no, resolved by Route 174 for the current bounded
  target-set lane.

### Explicit edit recovery apply

- Affected modules: Edit / Patch, Workspace / File Context, Result Surface,
  Session / Continue, Harness / Eval.
- Why it was a calibration gap: Route 170 captured snapshot-backed rollback
  readiness but left recovery apply as a low-level seam, while Route 172 target
  set partial failures needed a bounded way to recover changed
  snapshot-backed files without implying automatic or atomic rollback.
- Resolution: Route 173 adds `editRecoveryPlan.ts`,
  `editRecoveryApply.ts`, `editRecoveryOutcome.ts`, and
  `targetSetEditRecovery.ts` to plan from explicit snapshot ids and target
  paths, apply single-file or bounded target-set subset rollback only after
  explicit confirmation, run current-content guards and post-rollback
  verification, and project safe Result Surface / Session evidence.
- Evidence: recovery plan/apply tests, target-set recovery tests,
  snapshot/rollback regression tests, session continuity tests, and edit
  closeout verifier markers.
- Recommended next action: keep broad undo, fuzzy/generated rollback, automatic
  rollback, and atomic rollback claims closed until a separate route defines
  them.
- Should become a route: no, resolved by Route 173 for explicit
  snapshot-backed rollback apply.

### Discovery edit manifest and confirmed target-set execution

- Affected modules: Edit / Patch, Workspace / File Context, Result Surface,
  Session / Continue, Harness / Eval.
- Why it was a calibration gap: discovery-style edit prompts previously stopped
  as unsupported future edits, so there was no bounded candidate manifest,
  explicit confirmation state, or safe single-target handoff story.
- Resolution: Route 171 adds `discoveryEditManifest.ts`,
  `discoveryEditPlanner.ts`, `discoveryEditConfirmation.ts`, and
  `discoveryEditResult.ts`; manifests are no-write with
  `mutationAuthority: not-granted`, unconfirmed/ambiguous/broad/fuzzy/generated
  paths stop before mutation, and only one confirmed candidate can hand off to
  the existing exact fenced replacement lane. Route 172 adds
  `targetSetEditPlan.ts`, `targetSetEditRoute.ts`, and
  `targetSetEditResult.ts` for explicitly confirmed target sets that reduce to
  exact fenced replacement only, with max-file guard, preflight-all-before-
  mutation, per-file authority/stale-read/snapshot/verification, partial-
  failure evidence, rollback readiness, and no automatic or atomic rollback
  claim.
- Evidence: discovery manifest/planner/confirmation/result tests, target-set
  plan/route tests, fenced edit runtime activation tests, session continuity
  tests, runMvp focused target-set integration test, and edit closeout verifier
  markers.
- Recommended next action: do not expand beyond exact fenced replacement target
  sets until a separate route defines broader atomicity/recovery policy.
- Should become a route: no, resolved by Route 171 for no-write manifests and
  confirmed single-target handoff.

### Activated fenced replacement snapshot recovery substrate

- Affected modules: Edit / Patch, Workspace / File Context, Result Surface,
  Session / Continue, Harness / Eval.
- Why it was a calibration gap: exact fenced replacement could mutate one file,
  but broader edit expansion still needed a pre-write recovery authority story
  that did not leak raw content or imply automatic rollback.
- Resolution: Route 170 adds `editSnapshot.ts`, `editRecoveryResult.ts`, and
  `editRollback.ts`, wires pre-write snapshot capture into the activated exact
  fenced replacement lane, projects rollback readiness through result/session
  summaries, and keeps rollback explicit-only.
- Evidence: fenced edit route/result tests, snapshot/recovery/rollback tests,
  session continuity tests, and `verify-edit-capability-closeout.mjs` markers.
- Recommended next action: keep fuzzy/discovery/generated/multi-file edit
  stopped until target-set confirmation and atomicity routes exist.
- Should become a route: no, resolved by Route 170 for the single-file exact
  fenced replacement lane.

### Activated fenced replacement closeout taxonomy

- Affected modules: Edit / Patch, Result Surface, Session / Continue,
  Workspace / File Context, Permission / Policy, Harness / Eval.
- Why it was a calibration gap: Route 168 made exact fenced replacement
  reachable, but the activated lane still needed one stable success/stopped/
  failed taxonomy across terminal output, result mapping, continuation
  evidence, verifier markers, and no-write unsupported paths.
- Resolution: Route 169 adds `fencedEditOutcome.ts`, routes the markers through
  fenced edit route/result projection, keeps hard writer/verification failures
  as failed/error outcomes, and extends the edit closeout verifier coverage.
- Evidence: `fencedEditOutcome.ts`, `fencedEditRoute.ts`,
  `fencedEditResult.ts`, `resultMapper.ts`, `stoppedSessionContinuity.ts`,
  `verify-edit-capability-closeout.mjs`, fenced edit focused tests.
- Recommended next action: no broader edit expansion; keep fuzzy/discovery/
  generated/multi-file/rollback edits stopped until a dedicated route opens one.
- Should become a route: no, resolved by Route 169.

### Tool / Runtime command receipt evidence bridge

- Affected modules: Tool, Runtime, Result Surface, Session / Continue,
  Harness / Eval.
- Why it was a calibration gap: command execution already produced
  budgeted/sanitized `metadata.runtimeReceipt`, but run-command and verify
  evidence did not carry stable receipt markers for gate and transcript-safe
  inspection.
- Resolution: Route 165 added a narrow evidence bridge over the existing
  projected runtime receipt and wired it into run-command and verification
  evidence.
- Evidence: `flowDispatch.ts`, `runMvpIntegratedFlow.ts`,
  `verificationResultProjection.ts`, `flowDispatch.test.ts`,
  `verificationPlanner.test.ts`, `runtimeReceiptProjection.test.ts`,
  `resultMapperBoundary.test.ts`, `sessionRuntimeBoundary.test.ts`.
- Recommended next action: none for this gap; keep receipt markers evidence-only
  and leave terminal truthfulness in `resultMapper.ts`.
- Should become a route: no, resolved by Route 165.

### Session terminal blocker detail marker parity

- Affected modules: Result Surface, Session / Continue, CLI / UX.
- Why it was a contradiction: `resultMapper` and `actionableBlockerModule`
  recognized Route 162 provider/browser/edit markers, while
  `sessionTerminalState` kept a narrower duplicate classifier for terminal
  blocker detail rendering.
- Resolution: Route 164 made `sessionTerminalState` consume the shared Result
  Surface blocker classification and Result Surface-owned do-next projection.
- Evidence: `actionableBlockerModule.ts`, `sessionTerminalState.ts`,
  `sessionRuntimeBoundary.test.ts`, `crossCapabilityResultFlow.test.ts`,
  `resultMapperBoundary.test.ts`.
- Recommended next action: none for this risk; preserve the shared Result
  Surface vocabulary in future terminal output work.
- Should become a route: no, resolved by Route 164.

## Medium

### Harness gate taxonomy remains uneven

- Affected modules: Harness / Eval, Result Surface, Provider / Model.
- Why it is not a contradiction: current verifier facades preserve flags,
  report fields, dry-run facts, and redaction; the missing piece is a shared
  taxonomy across gate families.
- Evidence: `verifierModuleBoundary.test.mjs`, `verifier-module-extraction.md`,
  `module-backlog.md`.
- Recommended next action: run the already listed `Harness / gate taxonomy`
  route before expanding release/report claims.
- Should become a route: yes.

### Browser cleanup has layered local failure vs terminal stopped semantics

- Affected modules: Browser, Runtime, Result Surface, Session / Continue.
- Why it is not a contradiction: browser transaction cleanup failure is a
  capability-local failed result, while Result Surface can treat the same safe
  marker as an actionable stopped terminal result.
- Evidence: `browserTxn.ts`, `browserTxn.test.ts`,
  `crossCapabilityResultFlow.test.ts`.
- Recommended next action: keep the distinction documented; terminal surface
  marker parity is now covered by Route 164.
- Should become a route: no, unless terminal output parity is routed.

### Provider readiness diagnostic failure classification is intentionally mixed

- Affected modules: Provider / Model, Result Surface, CLI / UX.
- Why it is not a contradiction: missing config/key and opt-in are actionable
  stopped states; auth/unknown diagnostic failures can remain hard errors.
- Evidence: `providerReadinessCliSurface.test.ts`,
  `crossCapabilityResultFlow.test.ts`.
- Recommended next action: keep provider live/config boundaries closed; only
  revisit if a provider readiness parity route is selected.
- Should become a route: no by itself.

## Low

### Implementation context is documentation, not import policing

- Affected modules: Capability Contract Architecture, all capability owners.
- Why it is not a contradiction: the implementation context intentionally names
  owner modules and facades without enforcing import rules.
- Evidence: `docs/implementation-context/README.md` and manifest scope.
- Recommended next action: future routes should keep using it as route-start
  context and update it only when code ownership changes.
- Should become a route: no.

## Accepted

### Runtime receipts do not decide terminal truthfulness

- Affected modules: Runtime, Tool, Browser, MCP, Result Surface.
- Why accepted: runtime receipts are transcript-safe evidence and local status
  projections; `resultMapper.ts` remains the terminal truthfulness owner.
- Evidence: `runtime-receipt-contract.md`,
  `runtimeReceiptProjection.test.ts`, `resultMapper.ts`.
- Recommended next action: preserve this layering in future receipt-consumer
  routes.
- Should become a route: no.

### Verifier reports are evidence, not product behavior

- Affected modules: Harness / Eval, Result Surface.
- Why accepted: reports assert markers, redaction, and gate outcomes but do not
  authorize provider, browser, edit, session, CLI, or runtime behavior.
- Evidence: `verifierModuleBoundary.test.mjs`,
  `capability-flow-graph.md`.
- Recommended next action: keep report/schema work separate from runtime
  behavior changes.
- Should become a route: no.
