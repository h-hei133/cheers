# Capability Implementation Recipes

Use these recipes as route-start checklists. They are operational guardrails,
not import restrictions.

## Add A Bounded Edit Capability

- Start in: Edit / Patch.
- Use facades/contracts: `editPatchModule.ts`, `editExpectationContract.ts`,
  `fencedEditActivation.ts`, `fencedEditPlanner.ts`, `fencedEditRoute.ts`,
  `fencedEditOutcome.ts`, `fencedEditResult.ts`, `discoveryEditManifest.ts`,
  `discoveryEditPlanner.ts`, `discoveryEditConfirmation.ts`,
  `discoveryEditRuntime.ts`, `discoveryEditResult.ts`, `editSnapshot.ts`,
  `editRecoveryResult.ts`, `editRollback.ts`, `workspaceFileContract.ts`,
  `workspaceTargetProjection.ts`,
  `patchResult/workspaceAuthority.ts`, `mutationVerificationProjection.ts`.
- Consume: explicit in-workspace target, concrete content or exact mapping,
  exact fenced old/new mapping when using the fenced replacement lane,
  runtime activation facts when the lane is reached from prompt/CLI selection,
  bounded discovery candidate manifest and explicit single-target confirmation,
  workspace authority fact, final stale-read fact, pre-write snapshot receipt
  facts for activated exact fenced replacement, verification plan.
- Emit: patch/write result projection, changed/failed file summaries,
  fenced replacement activation, outcome taxonomy, and result projection,
  actionable blocker markers for missing target, missing content, no-match,
  multiple matches, stale-read, unsupported future edit, discovery confirmation
  required/invalid/no-candidate states, writer failure, and verification
  failure, verification summary, continuation-safe mutation evidence, safe snapshot receipt status, rollback readiness, explicit
  single-file rollback plan/apply evidence when directly invoked.
- Do not bypass: workspace authority, final stale-read, permission decisions,
  pre-write snapshot failure stops, post-write verification projection, Result
  Surface truthfulness. Do not mutate from discovery candidate manifests alone
  or infer target confirmation from vague wording. Do not run automatic rollback.
- Validate: focused edit/write route tests, stale-read/authority regression,
  fenced edit activation/runtime tests, discovery edit
  manifest/planner/confirmation/result tests, snapshot/recovery/rollback tests, CLI runtime invocation tests,
  mutation-lane rejection, `verify:edit-capability-closeout`,
  `verify:result-contract`, build if TS source changes.

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
  `sessionFutureTurnProjection.ts`, `sessionPersistenceProjection.ts`.
- Consume: safe evidence markers, target summaries, last terminal/coding
  result, replay-safe continuation seed.
- Emit: continuation seed, future-turn prompt context, replay-safe summary,
  recovery guidance if stopped.
- Do not bypass: transcript schema, replay safety filters, raw DOM/file/secret
  exclusion, SessionManager write-call ordering.
- Validate: continuation/sessionRuntime tests, SessionManager/session boundary
  tests, runMvp/result-contract when Agent Loop handoff changes.
