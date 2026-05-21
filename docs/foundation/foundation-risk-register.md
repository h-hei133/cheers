# Foundation Risk Register

Route: `docs/agent-routes/route163-foundation-consistency-audit.md`

## Blocking

None found in this audit. Terminal truthfulness, no-write edit preconditions,
runtime redaction, provider readiness redaction, and verifier dry-run safety all
have focused evidence.

## High

None open after Route 165.

## Resolved

### Context-aware provider proposal evidence

- Affected modules: Edit / Patch, Provider / Model, Workspace / File Context,
  Agent Loop, Result Surface, Session / Continue, Harness / Eval.
- Why it was a calibration gap: provider-backed edit proposals consumed a
  redacted provider context packet, but did not yet bind Route 181 targeted
  context packet ids and Route 182 Agent Plan readiness, confidence, missing
  facts, suggested reads, or verification candidates into the provider-facing
  proposal input and replay-safe evidence.
- Resolution: Route 184 adds context-aware provider edit input, prompt,
  proposal, and result facades. Missing context, over-budget context, and
  needs-more-context Agent Plans stop before provider invocation; fake-provider
  proposals record context packet and Agent Plan ids in no-write manifests and
  continuation evidence.
- Evidence: context-aware provider edit/prompt/proposal/result tests, provider
  proposal regressions, session result parity and continuation evidence parity
  tests, focused context-planning verifier, edit closeout verifier,
  result-contract, and build.
- Recommended next action: keep default real-provider calls, provider calls
  during apply, mutation from provider proposals, fuzzy/broad direct mutation,
  LSP/embedding/full-repo indexing, CLI/schema/dependency changes, and broad
  `runMvpIntegratedFlow.ts` rewrites closed until separate routes define them.
- Should become a route: no, resolved by Route 184 for proposal context
  evidence only.

### Session result parity after context and planning

- Affected modules: Result Surface, Session / Continue, Workspace / File
  Context, Agent Loop, Edit / Patch, Harness / Eval.
- Why it was a parity risk: context packets, Agent Plan summaries, and recent
  edit proposal/repair/hunk-set stopped states added safe terminal facts that
  could drift between terminal rendering, compact summaries, and `/continue`.
- Resolution: Route 183 adds session result parity and continuation evidence
  parity helpers so terminal compact output keeps approval-denied Reason and
  do-next distinct, and stopped/success handoff diagnostics reuse one
  replay-safe evidence extractor for context packets, agent plans, proposals,
  repairs, hunk-sets, target-set partial failures, and explicit recovery.
- Evidence: session result parity tests, continuation evidence parity tests,
  session runtime boundary tests, stopped-session continuity tests, session
  resume context tests, context/agent-plan regressions, focused parity verifier,
  result-contract, and build.
- Recommended next action: keep session schema, edit execution expansion,
  provider/browser calls, approval policy, CLI behavior, and raw compact/continue
  retention closed until separate routes define them.
- Should become a route: no, resolved by Route 183 for parity projection only.

### Targeted context planning substrate

- Affected modules: Workspace / File Context, Agent Loop, Result Surface,
  Session / Continue, Harness / Eval.
- Why it was a calibration gap: explicit target reads could inspect one file,
  while planning and complex edit stops had weak independent evidence about
  imports, tests, docs/readme references, call-site candidates, budget, and
  remaining missing context.
- Resolution: Route 181 adds deterministic read-only context packet,
  discovery, budget/redaction, planning, and result projection modules for
  explicit code targets. Packets summarize target/import/sibling/test/docs/
  call-site candidates, omit over-budget or unsafe sources with reasons, carry
  replay-safe summaries, and keep `mutationAuthority:not-granted`.
- Evidence: context budget/discovery/packet/plan/result tests, read/target
  regressions, runMvp context planning tests, Session / Continue continuity
  coverage, and the focused context-planning verifier.
- Recommended next action: keep provider planning, LSP/embedding/index
  discovery, browser context, schema/CLI changes, and edit execution expansion
  closed until separate routes define them.
- Should become a route: no, resolved by Route 181 for read/plan substrate
  only.

### Agent Loop planning facade

- Affected modules: Agent Loop, Workspace / File Context, Result Surface,
  Session / Continue, Harness / Eval.
- Why it was a coupling risk: Route 181 proved targeted context packets, but
  leaving context-aware readiness, confidence, missing facts, and suggested
  reads in `runMvpIntegratedFlow.ts` would keep expanding the central loop.
- Resolution: Route 182 adds deterministic Agent Plan facade modules over
  plan objects, context-packet-to-plan projection, workflow-plan readiness
  classification, and planning result projection. `runMvpIntegratedFlow.ts`
  remains the composition caller for context packet generation and plan result
  handoff.
- Evidence: agent plan/context/projection/result tests, context packet
  regressions, runMvp context-planning output markers, Session / Continue
  continuation evidence coverage, and the focused context-planning verifier.
- Recommended next action: keep autonomous planners, provider-generated plans,
  LSP/embedding/index discovery, edit execution expansion, schema/CLI changes,
  and mutation authority grants closed until separate routes define them.
- Should become a route: no, resolved by Route 182 for the planning facade
  boundary only.

### Verification repair proposal loop

- Affected modules: Edit / Patch, Provider / Model, Result Surface,
  Session / Continue, Harness / Eval.
- Why it was a calibration gap: verification failures could explain the
  failure and recovery guidance, but there was no review-gated repair proposal
  manifest that preserved safe failure context and handed off only to existing
  exact hunk-set apply.
- Resolution: Route 180 adds `editRepairContext.ts`,
  `editRepairProposal.ts`, `editRepairPlanner.ts`, and `editRepairResult.ts`
  so failed apply/verification facts can produce redacted repair context,
  deterministic fake-provider repair proposals, review-required no-write
  states, explicit exact hunk-set handoff, and Result Surface / Session
  evidence without automatic mutation.
- Evidence: edit repair context/proposal/planner/result tests, proposal
  review/selection/apply and hunk-set regressions, stopped-session continuity
  coverage, and edit closeout verifier markers.
- Recommended next action: keep automatic repair, provider calls during apply,
  fuzzy/broad repair, new writer behavior, and default real-provider repair
  calls closed until a separate route defines them.
- Should become a route: no, resolved by Route 180 for repair proposals only.

### Proposal review and apply bridge

- Affected modules: Edit / Patch, CLI / UX, Result Surface,
  Session / Continue, Harness / Eval.
- Why it was a calibration gap: generated/provider proposals could be created
  and marked handoff-ready, but there was no shared review surface, hunk/target
  selection model, explicit confirmation state machine, or apply bridge that
  reused the existing exact write lanes.
- Resolution: Route 177 adds `editProposalReview.ts`,
  `editProposalSelection.ts`, `editProposalApply.ts`, and
  `editProposalReviewResult.ts` to render compact no-write reviews, record
  reject/review-only/selection/confirmation states, apply confirmed exact
  single-target selections through the fenced route, apply confirmed exact
  target-set selections through the target-set transaction route, and project
  review/apply/partial-failure evidence through Result Surface and
  Session / Continue.
- Evidence: proposal review/selection/apply/result tests, generated/provider
  regression tests, fenced/target-set route regressions, session continuity
  regressions, CLI print helper coverage, and edit closeout verifier markers.
- Routes 178-179 update: per-target distinct exact mappings and bounded
  same-file exact multi-hunk apply are now covered by `proposalHunkSet.ts`,
  `proposalHunkSetPlan.ts`, `proposalHunkSetRoute.ts`,
  `proposalHunkSetResult.ts`, `exactHunkSet.ts`, `exactHunkConflict.ts`,
  `exactHunkApply.ts`, and `exactHunkResult.ts`. The hunk-set route requires
  explicit confirmation, all-hunk preflight, max guards, per-hunk exact mapping
  payloads, conflict/overlap checks, one snapshot/write per multi-hunk file,
  and target-set transaction/journal/recovery evidence.
- Recommended next action: keep fuzzy/broad/generated direct mutation,
  provider calls during apply, and new writer behavior closed until a separate
  route defines them. Bounded exact multi-hunk-per-file proposal apply is Route
  179-only and remains no-write for non-exact, ambiguous, overlapping, or
  unconfirmed hunks.
- Should become a route: no, resolved by Routes 177-179 for exact proposal
  review/selection/apply, per-target distinct hunk-set bridging, and bounded
  same-file exact multi-hunk apply.

### Provider-backed edit proposal lifecycle

- Affected modules: Edit / Patch, Provider / Model, Workspace / File Context,
  Result Surface, Session / Continue, Harness / Eval.
- Why it was a calibration gap: Route 175 established generated edit proposals
  without provider calls, leaving no safe context packet, provider proposal
  planner, or provider-specific review/confirmation/result coverage for
  model-assisted edit planning.
- Resolution: Route 176 adds `providerEditContext.ts`,
  `providerEditProposal.ts`, `providerEditPlanner.ts`,
  `providerEditConfirmation.ts`, and `providerEditResult.ts` so explicit
  provider-backed proposal generation consumes only redacted/budgeted context,
  normalizes provider output into no-write proposal manifests, and projects
  review or exact handoff-ready states through Result Surface and
  Session / Continue without granting mutation authority.
- Evidence: provider edit context/proposal/planner/confirmation/result tests,
  provider proposal session continuity regressions, and edit closeout verifier
  markers.
- Recommended next action: keep real-provider live calls opt-in and isolated;
  do not open provider-generated mutation, broad/fuzzy apply loops, or
  autonomous generation apply behavior without a separate route.
- Should become a route: no, resolved by Route 176 for provider-backed
  proposal generation and no-write handoff readiness.

### Generated edit proposal lifecycle

- Affected modules: Edit / Patch, Workspace / File Context, Result Surface,
  Session / Continue, Harness / Eval.
- Why it was a calibration gap: generated edit prompts previously collapsed
  into unsupported generated-content stops, while the edit stack had no
  reviewable no-write proposal surface or explicit conversion point into the
  exact lanes opened by Routes 167-174.
- Resolution: Route 175 adds `generatedEditProposal.ts`,
  `generatedEditPlanner.ts`, `generatedEditConfirmation.ts`, and
  `generatedEditResult.ts` to project generated edit proposal ids, safe target
  summaries, proposed content status, exact mapping readiness, confirmation
  state, no-write result/session evidence, and exact-lane handoff only through
  the existing fenced or target-set edit routes.
- Evidence: generated proposal/planner/confirmation/result tests, generated
  session continuity regression, fenced/target-set handoff regressions, and
  edit closeout verifier markers.
- Recommended next action: keep autonomous generation, provider-generated
  mutation, broad/fuzzy execution, and unconfirmed proposal mutation closed
  until a separate route defines them.
- Should become a route: no, resolved by Route 175 for the no-write proposal
  lifecycle and exact-lane handoff boundary.

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
