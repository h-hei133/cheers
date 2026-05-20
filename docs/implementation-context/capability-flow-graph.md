# Capability Flow Graph

This graph shows the current modularized wiring. It names implementation
handoffs; it does not authorize behavior changes.

## Common Turn Spine

```text
CLI / UX
  -> ShellSessionRuntime
  -> Agent Loop runMvpIntegratedFlow
  -> capability owner facade
  -> Result Surface handoff
  -> resultMapper terminal truthfulness
  -> Session / Continue persistence and future-turn context
  -> Harness / Eval verifier when the route has a gate
```

## CLI Prompt / Non-Interactive Turn

- Entry point: `packages/ts-shell/src/entrypoints/cli.tsx`.
- Owner module: CLI / UX.
- Public facades: `cliApprovalModule.ts`, `cliRuntimeModule.ts`,
  `cliSessionModule.ts`, `cliWorkspaceModule.ts`, `cliPermissionModule.ts`.
- Inputs: argv, prompt/stdin/replay mode, selected session, workspace root,
  provider readiness snapshot, approval mode.
- Outputs: runtime turn payload, approval handler, selected session/project
  context, workspace/project root projection.
- Downstream consumers: `ShellSessionRuntime`, Session / Continue,
  Permission / Policy, Agent Loop.
- Result handoff: runtime events stream to session runtime; terminal result
  comes from Agent Loop and `resultMapper.ts`.
- Transcript/continuation handoff: session runtime appends query events and
  persists terminal state through SessionManager.
- Validation gates: CLI facade/adjacent tests, slash/CLI tests, build if TS
  source changes.
- Forbidden shortcuts: do not put approval decisions, session schema changes,
  provider auth reads, or result truthfulness in `cli.tsx`.

## Read / Inspect

- Entry point: Agent Loop prompt planning in `runMvpIntegratedFlow.ts`.
- Owner module: Workspace / File Context.
- Public facades: `readInspectModule.ts`, `workspaceFileContract.ts`,
  `workspaceTargetProjection.ts`.
- Inputs: prompt, workspace root, path hints, continuation target evidence,
  repo-explain candidates.
- Outputs: read/inspect classification, target recovery, missing/ambiguous/out
  of workspace stopped surfaces, repo-explain evidence role.
- Downstream consumers: Agent Loop, Result Surface, Session / Continue.
- Result handoff: stopped target surfaces feed coding result and
  `resultMapper.ts`; successful read remains no-write evidence.
- Transcript/continuation handoff: read windows and target summaries may become
  continuation-safe evidence through Session / Continue projections.
- Validation gates: read/inspect adjacent tests, workspace target tests,
  runMvp when Agent Loop routing changes, result-contract for stopped surfaces.
- Forbidden shortcuts: do not grant write authority from read targets, future
  discovery candidates, or continuation hints.

## Edit / Patch

- Entry point: Agent Loop edit planning and bounded mutation execution.
- Owner module: Edit / Patch.
- Public facades: `editPatchModule.ts`, `editExpectationContract.ts`,
  `futureEditContract.ts`, `futureEditPlanner.ts`,
  `patchResult/workspaceAuthority.ts`, `patchResult/workspaceWriteResult.ts`.
- Inputs: explicit target, concrete content or exact replacement/patch shape,
  workspace authority facts, final stale-read facts, verification plan.
- Outputs: current supported edit expectation, future-only stopped contract,
  patch/write result projection, changed/failed file summaries, verification
  preconditions, actionable blocker evidence.
- Downstream consumers: Agent Loop, Result Surface, Session / Continue,
  Harness / Eval.
- Result handoff: edit result summaries and blockers feed `resultMapper.ts`
  through coding result fields and actionable evidence. The Edit / Patch
  module emits no-write markers for missing target, missing content, stale-read,
  and unsupported future-edit stopped states.
- Transcript/continuation handoff: mutation results and stale-read evidence
  feed continuation/recovery summaries without raw file dumps.
- Validation gates: edit closeout, workspace write route tests, mutation-lane
  rejection regression, result-contract, runMvp if routing changes, build for
  TS source changes.
- Forbidden shortcuts: do not infer write authorization from prompt text, skip
  workspace authority, skip final stale-read, broaden to multi-file/add/delete
  /move/rollback without a dedicated route, or turn dry-run into write success.

## Tool / Command Runtime

- Entry point: Agent Loop tool dispatch and tool registry.
- Owner modules: Tool and Runtime.
- Public facades: `toolRuntimeModule.ts`, `toolPolicyResult.ts`,
  `toolResultProjection.ts`, `toolLifecycleProjection.ts`,
  `runtimeReceipt.ts`, `runtimeReceiptProjection.ts`.
- Inputs: tool request, command allowlist, approval decision, sandbox/runtime
  facts, MCP availability and error taxonomy.
- Outputs: tool lifecycle result, provenance summary, runtime receipt metadata,
  transcript-safe tool/runtime summaries.
- Downstream consumers: Agent Loop, Result Surface, Session / Continue,
  Harness / Eval.
- Result handoff: command success/failure/blocked/MCP unavailable facts become
  coding result fields or actionable blockers before `resultMapper.ts`.
- Transcript/continuation handoff: tool/runtime summaries are budgeted and
  redacted before transcript or replay use.
- Validation gates: tool runtime facade tests, flowDispatch tests, MCP focused
  tests when touched, result-contract, runMvp if dispatch order changes.
- Forbidden shortcuts: do not bypass approval, command allowlist, MCP safe
  detail projection, runtime receipt redaction, or terminal truthfulness.

## Browser Transaction

- Entry point: Agent Loop browser plan detection and browser runtime/tool
  surfaces.
- Owner module: Browser.
- Public facades: `browserModule.ts`, `browserCapabilitySurface.ts`,
  `browserRuntimeAvailabilitySurface.ts`, `browserRuntimeSurface.ts`,
  `browserExecutionReceiptSurface.ts`, `browserToolPolicy.ts`,
  `browserPublicReadOnlyWebPolicy.ts`.
- Inputs: browser plan, runtime availability, local-fixture/public-web policy,
  action target metadata, transaction trace/report facts.
- Outputs: browser execution result, observation summary, transaction report,
  cleanup status, browser actionable blockers.
- Downstream consumers: Agent Loop, Result Surface, Session / Continue,
  Browser harness gates.
- Result handoff: browser unavailable/policy/timeout/cleanup/adapter facts feed
  actionable stopped paths; raw observations do not define terminal success.
- Transcript/continuation handoff: safe observation summaries and trace-backed
  continuation facts exclude raw DOM/page content by default.
- Validation gates: browser transaction gate, browser facade/adjacent tests,
  result-contract when result mapping changes.
- Forbidden shortcuts: do not enable public web/default browser actions,
  persist auth/session state, expose raw DOM/screenshots/OCR-like content, or
  apply selector repair without explicit confirmation.

## Provider Diagnostic / Model Path

- Entry point: CLI provider snapshot/readiness and Agent Loop model adapter
  handoff.
- Owner module: Provider / Model.
- Public facades: `providerModule.ts`, `providerOutcomeProjection.ts`,
  `providerReadiness.ts`, `providerReadinessCliSurface.ts`,
  `providerAuthContract.ts`.
- Inputs: redacted provider readiness facts, model adapter result, diagnostic
  continuity facts, explicit real-provider opt-in when a gate allows it.
- Outputs: provider diagnostic handoff, readiness classification, redacted
  startup/readiness surfaces.
- Downstream consumers: CLI / UX, Agent Loop, Result Surface, Harness / Eval.
- Result handoff: provider not-configured, opt-in-required, unsupported, and
  diagnostic facts become stopped/error facts through Result Surface; provider
  config is never exposed.
- Transcript/continuation handoff: provider diagnostic continuity is safe and
  redacted; credentials and config paths are not persisted.
- Validation gates: provider facade/readiness tests, result-contract if
  terminal mapping changes, isolated real-provider gate only when explicitly
  opened.
- Forbidden shortcuts: do not read, print, summarize, copy, clean, or modify
  `/home/wang/.private-agents-real`; do not make real-provider behavior a
  default path.

## Session / Continue

- Entry point: `ShellSessionRuntime` and `SessionManager`.
- Owner module: Session / Continue.
- Public facades: `sessionEventSurface.ts`, `sessionTerminalState.ts`,
  `sessionPersistenceProjection.ts`, `sessionFutureTurnProjection.ts`,
  `sessionStore.ts`, `sessionRegistry.ts`, `sessionCompactModule.ts`,
  `sessionContinuityModule.ts`, `sessionApprovalMemoryModule.ts`.
- Inputs: query events, terminal result, coding result, continuation seeds,
  compact/project-memory future-turn facts, approval audit facts.
- Outputs: transcript event lines, terminal state, assistant turn payload,
  compact/replay/continuation summaries, approval memory payload.
- Downstream consumers: CLI / UX, Agent Loop future turns, Result Surface,
  Harness / Eval.
- Result handoff: session runtime consumes `resultMapper.ts` output; it does
  not decide terminal truthfulness.
- Transcript/continuation handoff: SessionManager persists existing metadata,
  state, and transcript schemas while projections filter unsafe evidence.
- Validation gates: sessionRuntime boundary/runtime tests, SessionManager
  boundary/session tests, runMvp/result-contract when result/session handoffs
  change.
- Forbidden shortcuts: do not change metadata/state/transcript schemas, event
  ordering, compact retention semantics, replay trust boundaries, or store
  layout without a dedicated route.

## Verifier / Harness

- Entry point: `scripts/verify-real-user-capabilities.mjs` compatibility shim
  and `scripts/verify/index.mjs` composition root.
- Owner module: Harness / Eval.
- Public facades: `verifierCliModule.mjs`, `verifierCaseModule.mjs`,
  `verifierSafetyModule.mjs`, `verifierReportModule.mjs`.
- Inputs: verifier argv, tier/suite/case selection, isolated test root, dry-run
  and include-real flags, scenario definitions, provider preflight facts.
- Outputs: selected/skipped case plan, safety facts, marker output, JSON report,
  exit-code classification.
- Downstream consumers: route closeout reports, release/deterministic gates,
  Provider / Model opt-in gates.
- Result handoff: verifier reports assert runtime/result semantics but do not
  become product behavior.
- Transcript/continuation handoff: no session schema handoff; reports must be
  redacted and isolated.
- Validation gates: verifier boundary self-test, selected verifier tier/suite
  commands, result-contract when result claims are touched.
- Forbidden shortcuts: do not hide skips, change exit codes/markers/report
  fields, launch external MCP or real-provider paths without explicit opt-in,
  or read real-provider config manually.
