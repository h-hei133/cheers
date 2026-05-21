# Capability Implementation Recipes

Use these recipes as route-start checklists. They are operational guardrails,
not import restrictions.

## Add A Bounded Edit Capability

- Start in: Edit / Patch.
- Use facades/contracts: `editPatchModule.ts`, `editExpectationContract.ts`,
  `fencedEditActivation.ts`, `fencedEditPlanner.ts`, `fencedEditRoute.ts`,
  `fencedEditOutcome.ts`, `fencedEditResult.ts`, `discoveryEditManifest.ts`,
  `discoveryEditPlanner.ts`, `discoveryEditConfirmation.ts`,
  `discoveryEditRuntime.ts`, `discoveryEditResult.ts`,
  `targetSetEditPlan.ts`, `targetSetEditRoute.ts`,
  `targetSetEditResult.ts`, `targetSetEditTransaction.ts`,
  `targetSetEditJournal.ts`, `targetSetEditPolicy.ts`,
  `targetSetEditVerification.ts`, `targetSetEditRecoveryWorkflow.ts`,
  `targetSetEditRecovery.ts`, `generatedEditProposal.ts`,
  `generatedEditPlanner.ts`, `generatedEditConfirmation.ts`,
  `generatedEditResult.ts`, `providerEditContext.ts`,
  `providerEditProposal.ts`, `providerEditPlanner.ts`,
  `providerEditConfirmation.ts`, `providerEditResult.ts`,
  `contextAwareProviderEdit.ts`, `contextAwareProviderPrompt.ts`,
  `contextAwareProviderProposal.ts`, `contextAwareProviderResult.ts`,
  `editRepairContext.ts`, `editRepairProposal.ts`,
  `editRepairPlanner.ts`, `editRepairResult.ts`,
  `editProposalReview.ts`, `editProposalSelection.ts`,
  `editProposalApply.ts`, `editProposalReviewResult.ts`, `exactHunkSet.ts`,
  `exactHunkConflict.ts`, `exactHunkApply.ts`, `exactHunkResult.ts`,
  `editSnapshot.ts`,
  `editRecoveryPlan.ts`, `editRecoveryApply.ts`, `editRecoveryOutcome.ts`,
  `editRecoveryResult.ts`, `editRollback.ts`, `workspaceFileContract.ts`,
  `workspaceTargetProjection.ts`,
  `patchResult/workspaceAuthority.ts`, `mutationVerificationProjection.ts`.
- Consume: explicit in-workspace target, concrete content or exact mapping,
  exact fenced old/new mapping when using the fenced replacement lane,
  runtime activation facts when the lane is reached from prompt/CLI selection,
  bounded discovery candidate manifest and explicit single-target confirmation,
  explicit confirmed target set for exact fenced replacement only,
  generated edit no-write proposal manifest and explicit exact mapping
  confirmation facts, provider edit safe context packet and explicit provider
  availability facts when provider-backed proposal generation is opened,
  targeted context packet ids plus Agent Plan readiness, confidence, missing
  facts, suggested reads, and verification candidates when context-aware
  provider proposal generation is opened,
  verification repair safe context and repair proposal facts when failed apply
  or verification opens review-gated repair planning,
  proposal review/selection facts and explicit apply confirmation,
  proposal hunk-set manifest facts for per-target distinct exact mappings and
  bounded exact multi-hunk-per-file selections,
  workspace authority fact, final stale-read fact, pre-write snapshot receipt
  facts for activated exact fenced replacement, explicit snapshot ids and
  target paths for recovery apply, verification plan.
- Emit: patch/write result projection, changed/failed file summaries,
  fenced replacement activation, outcome taxonomy, and result projection,
  actionable blocker markers for missing target, missing content, no-match,
  multiple matches, stale-read, unsupported future edit, discovery confirmation
  required/invalid/no-candidate states, writer failure, and verification
  failure, confirmed target-set success/preflight-stopped/partial-failure
  facts, target-set transaction id, safe journal, verification aggregate,
  recovery workflow handoff, generated proposal no-write/review/handoff
  evidence, provider proposal no-write/review/handoff-ready evidence,
  context-aware provider proposal no-write evidence with context packet and
  Agent Plan ids, missing-context stopped evidence, provider invalid-output
  stopped evidence, and review/handoff readiness,
  verification repair context/proposal/review states with no automatic repair
  mutation,
  proposal review/reject/selection/apply bridge evidence,
  proposal hunk-set apply evidence for distinct per-target exact mappings,
  exact hunk-set conflict/preflight evidence, one snapshot/write per file for
  bounded multi-hunk targets, hunk-level changed/failed/unattempted counts,
  continuation-safe mutation evidence, safe snapshot receipt status,
  rollback readiness, explicit recovery plan/apply evidence for
  single-file and bounded target-set subset rollback when directly invoked.
- Do not bypass: workspace authority, final stale-read, permission decisions,
  pre-write snapshot failure stops, post-write verification projection, Result
  Surface truthfulness. Do not mutate from discovery candidate manifests alone
  or infer target confirmation from vague wording. Target-set execution must
  preflight all files before the first mutation and reuse the existing
  single-file fenced lane per target. Recovery apply must require explicit
  snapshot ids, target paths, current-content guards, workspace authority, and
  direct rollback confirmation. Generated edit proposals must not mutate, call
  providers by default, or become authority until reduced to explicit old/new
  mapping and confirmed target(s). Provider-backed proposal generation must use
  explicit provider availability, redacted/budgeted context, and no provider
  generated mutation. Proposal review and selection are not write authority;
  apply must reuse the existing fenced or target-set transaction routes and
  must not call providers. Per-target distinct proposal mappings must use a
  hunk-set manifest, all-hunk preflight before mutation, exact conflict checks,
  existing fenced route execution for one-hunk files, and bounded exact
  multi-hunk apply with one snapshot/write per file for multi-hunk targets.
  Repair proposals must be generated only from redacted failed verification/apply
  context, stay review-required and no-write by default, and hand off only after
  explicit exact hunk confirmation to the existing hunk-set apply route. Repair
  planning must not call providers during apply or run automatic repair.
  Context-aware provider proposals must stop before provider invocation when
  targeted context or Agent Plan readiness is missing, must use only redacted
  budgeted prompt context, and must record context packet / Agent Plan ids
  without granting mutation authority.
  Do not run automatic rollback.
- Validate: focused edit/write route tests, stale-read/authority regression,
  fenced edit activation/runtime tests, discovery edit
  manifest/planner/confirmation/result tests, generated edit
  proposal/planner/confirmation/result tests, provider edit
  context/proposal/planner/confirmation/result tests, context-aware provider
  edit/prompt/proposal/result tests, edit repair
  context/proposal/planner/result tests, proposal review/selection/apply/result
  tests, proposal hunk-set
  manifest/plan/route/result tests, exact hunk set/conflict/apply/result
  tests, target-set edit
  plan/route/result/transaction/journal/policy/verification tests, target-set
  recovery workflow/recovery tests,
  snapshot/recovery/rollback tests, CLI runtime invocation tests,
  mutation-lane rejection, `verify:edit-capability-closeout`,
  `verify:result-contract`, build if TS source changes.

## Add A Targeted Context Planning Surface

- Start in: Workspace / File Context, then hand off safe facts to Agent Loop,
  Result Surface, Session / Continue, and Harness / Eval.
- Use facades/contracts: `readInspectModule.ts`, `contextPacket.ts`,
  `contextDiscovery.ts`, `contextBudget.ts`, `contextPlan.ts`,
  `contextPacketResult.ts`, `agentPlan.ts`, `agentPlanContext.ts`,
  `agentPlanProjection.ts`, `agentPlanResult.ts`, `workspaceFileContract.ts`,
  `workspaceTargetProjection.ts`, `continuationModule.ts`,
  `resultSurfaceModule.ts`, and Session / Continue continuity helpers.
- Consume: one explicit in-workspace code target, current read-only file facts,
  bounded local filesystem discovery candidates, and optional prompt intent for
  context packet / planning context.
- Emit: deterministic packet id, target safe label, included and omitted source
  summaries, budget and redaction status, replay-safe summary, suggested next
  reads, likely tests, verification candidates, agent plan readiness,
  confidence, missing facts, suggested reads, do-next text, and
  `mutationAuthority:not-granted`.
- Do not bypass: workspace boundaries, raw full-content exclusion, provider
  config and credential redaction, Result Surface truthfulness, transcript
  replay safety, write authority, final stale-read, or edit confirmation. Do
  not add LSP, embeddings, full-repo semantic index, browser work, provider
  calls, schema/CLI/dependency changes, or mutation reachability.
- Validate: context packet/discovery/budget/plan/result tests,
  agent plan/context/projection/result tests,
  read/inspect and target-resolution regressions, Session / Continue
  regressions, focused runMvp context planning tests, focused verifier gate,
  `verify:result-contract`, and build if TypeScript source changes.

## Add A Browser Action

- Start in: Browser.
- Use facades/contracts: `browserModule.ts`, browser runtime/policy/receipt
  surfaces, transaction trace/report/scoring helpers where applicable.
- Consume: browser plan, runtime availability, network/local-fixture policy,
  action target metadata, explicit confirmation facts for risky apply paths.
- Emit: safe observation summary, transaction trace/report, cleanup status,
  actionable unavailable/policy/timeout/cleanup/adapter blocker facts.
- Do not bypass: public-web opt-in boundary, raw DOM/page-content exclusion,
  auth/session persistence boundary, selector-repair confirmation boundary.
- Validate: browser transaction gate or focused browser adjacent tests,
  `verify:result-contract` when result mapping changes.

## Add A Provider Diagnostic Marker

- Start in: Provider / Model.
- Use facades/contracts: `providerModule.ts`, `providerOutcomeProjection.ts`,
  `providerReadiness.ts`, `providerReadinessCliSurface.ts`.
- Consume: redacted readiness or adapter diagnostic facts; explicit
  real-provider opt-in only when the route opens it.
- Emit: provider diagnostic handoff, readiness classification, provider-specific
  not-configured/opt-in/unsupported markers, redacted reason and do-next text.
- Do not bypass: real-provider home boundary, readiness redaction,
  non-default opt-in gates, isolated test roots for real-provider gates.
- Validate: provider readiness/facade tests, `verify:result-contract` if
  terminal classification changes, explicit isolated real-provider gate only
  when required.

## Add A CLI Command

- Start in: CLI / UX, then delegate to the owner module for behavior.
- Use facades/contracts: `cliSessionModule.ts`, `cliWorkspaceModule.ts`,
  `cliPermissionModule.ts`, `cliApprovalModule.ts`, or a new CLI facade for the
  command family.
- Consume: slash command args, current session/project context, workspace root,
  policy/permission facts if relevant.
- Emit: display surface lines, command result object, or runtime handoff payload.
- Do not bypass: owner module contract, session schema, provider redaction,
  approval prompt bridge, ShellSessionRuntime for prompt execution.
- Validate: focused CLI facade tests, slash router tests, CLI baseline/build if
  source changes.

## Add A Verifier Gate

- Start in: Harness / Eval.
- Use facades/contracts: `verifierCliModule.mjs`, `verifierCaseModule.mjs`,
  `verifierSafetyModule.mjs`, `verifierReportModule.mjs`, existing runner and
  residue helpers.
- Consume: argv flags, selected case metadata, isolated test root, expected
  markers, redaction requirements.
- Emit: stable pass/fail/skip markers, JSON report fields, exit-code
  classification, residue classification.
- Do not bypass: dry-run/list semantics, include-real restrictions, dirty-repo
  guard, report redaction, opt-in external MCP/real-provider gates.
- Validate: `node --check` for touched scripts, verifier self-test/focused
  suite, `verify:result-contract` when result claims are asserted.

## Calibrate A Tool / Runtime Command Outcome

- Start in: Tool and Runtime.
- Use facades/contracts: `toolRuntimeModule.ts`, `flowDispatch.ts`,
  `toolLifecycleProjection.ts`, `toolExecutionOutcomeProjection.ts`,
  `runtimeReceipt.ts`, and `runtimeReceiptProjection.ts`.
- Consume: existing tool result metadata, projected runtime receipt, approval
  decision, command allowlist result, and current verification summary.
- Emit: tool lifecycle projection, provenance summary, budgeted
  `runtime-receipt-*` evidence markers, and Result Surface inputs that preserve
  current truthfulness.
- Do not bypass: command allowlist, sandbox/approval policy, runtime receipt
  redaction, `resultMapper.ts` truthfulness, or session schema boundaries.
- Validate: focused tool/runtime/verification/result/session tests,
  `verify:result-contract`, and build when TypeScript source changes.

## Add A Result Stopped Path

- Start in: Result Surface.
- Use facades/contracts: `actionableBlockerModule.ts`,
  `terminalClassificationProjection.ts`, `capabilityResultClassification.ts`,
  `resultMapper.ts`, and capability-owned evidence projectors.
- Consume: safe reason, do-next text, blocker kind, coding result evidence,
  verification status, terminal reason.
- Emit: `stopped_error` with `terminalClassification: "stopped"` when
  actionable, or `error` only for hard failures under the current contract.
- Do not bypass: explicit terminal classification precedence, final mapping
  order in `resultMapper.ts`, result-contract verifier, redaction rules.
- Validate: resultMapper boundary tests, existing resultMapper tests,
  `verify:result-contract`.

## Add Continuation Support For A Capability

- Start in: Session / Continue, with the capability owner providing safe facts.
- Use facades/contracts: `continuationModule.ts`, `sessionContinuityModule.ts`,
  `sessionFutureTurnProjection.ts`, `sessionPersistenceProjection.ts`,
  `sessionResultParity.ts`, `continuationEvidenceParity.ts`.
- Consume: safe evidence markers, target summaries, last terminal/coding
  result, replay-safe continuation seed.
- Emit: continuation seed, future-turn prompt context, replay-safe summary,
  recovery guidance if stopped, safe reason/do-next parity, and capability
  evidence summaries without raw content.
- Do not bypass: transcript schema, replay safety filters, raw DOM/file/secret
  exclusion, SessionManager write-call ordering.
- Validate: continuation/sessionRuntime tests, SessionManager/session boundary
  tests, parity projection tests, runMvp/result-contract when Agent Loop
  handoff changes.
