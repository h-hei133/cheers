# Capability Implementation Recipes

Use these recipes as route-start checklists. They are operational guardrails,
not import restrictions.

## Add A Bounded Edit Capability

- Start in: Edit / Patch.
- Use facades/contracts: `editPatchModule.ts`, `editExpectationContract.ts`,
  `workspaceFileContract.ts`, `workspaceTargetProjection.ts`,
  `patchResult/workspaceAuthority.ts`, `mutationVerificationProjection.ts`.
- Consume: explicit in-workspace target, concrete content or exact mapping,
  workspace authority fact, final stale-read fact, verification plan.
- Emit: patch/write result projection, changed/failed file summaries,
  actionable blocker markers, verification summary, continuation-safe mutation
  evidence.
- Do not bypass: workspace authority, final stale-read, permission decisions,
  post-write verification projection, Result Surface truthfulness.
- Validate: focused edit/write route tests, stale-read/authority regression,
  mutation-lane rejection, `verify:edit-capability-closeout`,
  `verify:result-contract`, build if TS source changes.

## Add A Browser Action

- Start in: Browser.
- Use facades/contracts: `browserModule.ts`, browser runtime/policy/receipt
  surfaces, transaction trace/report/scoring helpers where applicable.
- Consume: browser plan, runtime availability, network/local-fixture policy,
  action target metadata, explicit confirmation facts for risky apply paths.
- Emit: safe observation summary, transaction trace/report, cleanup status,
  actionable unavailable/policy/timeout/adapter blocker facts.
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
- Emit: provider diagnostic handoff, readiness classification, redacted reason
  and do-next text.
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

