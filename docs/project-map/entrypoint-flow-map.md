# Entrypoint Flow Map

## CLI Prompt Path

- Entrypoint: `packages/ts-shell/src/entrypoints/cli.tsx`.
- Major steps: parse args -> resolve workspace/project root -> bootstrap shell runtime/session -> resolve stdin/print/interactive/replay mode -> create `ShellSessionRuntime` -> execute prompt or slash command.
- Modules involved: CLI / UX, Session / Continue, Permission / Policy, Provider credential resolution, MCP gateway, Agent Loop.
- Evidence emitted: startup surface, session id, provider/model labels, query events, approval provenance.
- Result surface emitted: terminal output via `sessionRuntime.ts` and `sessionTerminalState.ts`.
- What it proves: prompt execution can enter the shared shell runtime path.
- What it does not prove: every CLI mode has identical behavior for every capability without baseline gates.
- Status: focused-test-only.

## runMvpIntegratedFlow Path

- Entrypoint: `runMvpIntegratedFlow` / `streamMvpIntegratedFlow`.
- Major steps: optional apply_patch runtime route -> runtime config -> browser runtime status -> MCP snapshot -> sandbox enforcer -> tool dispatcher -> `MultiAgentOrchestrator` planner/coder/reviewer -> workflow plan -> capability branch -> result.
- Modules involved: Agent Loop, Tool runtime, MCP, Browser, Provider, Edit / Patch, Verification, Result Surface.
- Evidence emitted: workflow decision trace, plan notes, capability evidence, runtime/tool receipts.
- Result surface emitted: `OrchestrationResult` with coding result, transcript, terminal classification.
- What it proves: central integration path exists.
- What it does not prove: module boundaries are clean; this remains the main coupling hotspot.
- Status: partially closed.

## Task Lifecycle Activation Path

- Entrypoint: `activateTaskLifecycle` from `runMvpIntegratedFlow.ts`.
- Major steps: workflow plan -> task intent/stages -> context bundle -> analysis/plan quality -> lifecycle activation result -> runtime outcome or anchored runtime path.
- Modules involved: Task Lifecycle, Workspace / File Context, Analysis / Plan Quality, Provider Proposal runtime.
- Evidence emitted: lifecycle ids, analysis brief ids, plan quality ids, context packet/graph ids.
- Result surface emitted: no-write lifecycle/context output or anchored proposal runtime output.
- What it proves: deterministic task lifecycle evidence can be produced for eligible prompts.
- What it does not prove: live provider task-loop apply/verification closure.
- Status: focused-test-only.

## Context Planning Path

- Entrypoint: context-planning prompt through `runMvpIntegratedFlow.ts` or module tests.
- Major steps: explicit target -> `buildContextGraphPlanningBundle` -> context packet -> context graph -> test impact -> Agent Plan -> Plan Quality -> result projection.
- Modules involved: Workspace / File Context, Context Graph / Code Graph, Analysis / Plan Quality, Result Surface, Session / Continue.
- Evidence emitted: `context-packet:*`, `context-graph:*`, `test-impact:*`, `agent-plan:*`, `plan-quality:*`.
- Result surface emitted: read-only context/plan output and stopped/ready status.
- What it proves: deterministic no-write context planning around explicit targets.
- What it does not prove: full semantic repo understanding or provider execution.
- Status: focused-test-only.

## Provider Anchored Smoke Path

- Entrypoint: `scripts/verify-real-provider-anchored-smoke.mjs`.
- Major steps: print gate markers -> default skip unless opt-in -> load approved provider env only through script path when opt-in -> bundle/run `anchoredSmokeRunner.ts` -> provider readiness -> adapter approval -> provider call -> prompt audit/output validation/anchor quality -> no-write result -> focused tests.
- Modules involved: Harness / Eval, Provider / Model, Provider Proposal / Smoke, Proposal Anchoring, Session / Continue.
- Evidence emitted: `adapter-approved`, `provider-called`, `output-validation`, `anchor-quality`, `no-write`, `mutation-authority`, raw output excluded.
- Result surface emitted: script status taxonomy and smoke markers.
- What it proves: Route 199 live `openai-compatible` provider-called exact-ready no-write smoke when user-observed opt-in succeeds.
- What it does not prove: workspace apply or post-apply verification.
- Status: live-provider-called for Route 199; default-safe-skip by default.

## Real Task Loop Verifier Path

- Entrypoint: `scripts/verify-real-provider-task-loop-mvp.mjs`.
- Major steps: print task-loop markers -> run `taskLoopRunner.ts` -> default skip or opt-in config path -> `runRealTaskLoopRuntime` -> fixture -> optional provider runtime -> optional confirmation apply -> readback verification -> result/scorecard -> focused tests.
- Modules involved: Harness / Eval, Provider / Model, Task Lifecycle, Proposal Anchoring, Proposal Review/Apply, Edit / Patch, Verification / Runtime.
- Evidence emitted: `provider-called`, `apply`, `verification`, `mutation-scope`, `anchor-quality`, `status`.
- Result surface emitted: task-loop output and scorecard.
- What it proves: current observed Route 200 state is stopped with `provider-called=false`, `apply=not-run`, `verification=not-run`.
- What it does not prove: live task-loop provider call, apply, or verification.
- Status: live-provider-no-write stopped; not live task-loop success.

## Proposal Review / Apply Path

- Entrypoint: `applyEditProposalSelection`.
- Major steps: validate selection -> require confirmed exact single-target or target-set -> map hunk mappings -> choose fenced, target-set, or hunk-set route -> apply through existing routes.
- Modules involved: Proposal / Review, Edit / Patch, Workspace Authority, Snapshot / Recovery.
- Evidence emitted: `edit-proposal-apply:*`, `proposal-hunk-set-route:*`, `target-set-edit-route:*`, no-provider-call markers.
- Result surface emitted: apply result with changed files and transcript summary.
- What it proves: review/apply bridge can hand confirmed exact selections to existing apply routes.
- What it does not prove: unconfirmed proposals or provider output can mutate.
- Status: focused-test-only.

## Edit Apply Path

- Entrypoint: `runWorkspaceWriteRoute`, `runFencedEditReplacementRoute`, `runTargetSetEditRoute`, `runProposalHunkSetRoute`, `runExactHunkApplyRoute`.
- Major steps: explicit opt-in -> parse/verify patch or exact mapping -> workspace authority -> write decision -> guarded gate -> final stale-read -> optional snapshot -> writer -> post-write readback -> result.
- Modules involved: Edit / Patch, Permission / Policy, Workspace / File Context, Snapshot / Recovery, Result Surface.
- Evidence emitted: `apply-patch-workspace-write-route:*`, `fenced-edit-route:*`, `target-set-edit-route:*`, `proposal-hunk-set-route:*`.
- Result surface emitted: changed/failed/unattempted files, post-write verification, terminal classification.
- What it proves: bounded exact selected-workspace mutation paths with final stale-read and no false success for blocked/partial failures.
- What it does not prove: broad/fuzzy/move/delete/AST/arbitrary mutation or automatic rollback.
- Status: focused-test-only / synthetic candidate for candidate routes.

## Verification Command Path

- Entrypoint: `runVerificationCommand`.
- Major steps: if plan not ready, no dispatch -> if ready, dispatch `bash` through existing tool runtime with approval event -> build verification command result.
- Modules involved: Verification / Runtime, Tool runtime, Permission / Policy, Result Surface.
- Evidence emitted: runtime dispatch markers, command result evidence, mutation not-run, provider call not-run.
- Result surface emitted: verification status and runtime receipt evidence.
- What it proves: verification command execution is allowlisted and routed through existing tool runtime.
- What it does not prove: arbitrary shell execution or broad verification inference.
- Status: focused-test-only.

## Repair Proposal Path

- Entrypoint: `planEditRepairProposal`, `runVerificationRepairLoop`.
- Major steps: build failed apply/verification context -> provider/fake provider availability gate -> normalize repair proposal -> review-required/no-write result -> optional confirmed hunk-set handoff readiness.
- Modules involved: Repair Loop, Provider / Model, Proposal / Review, Edit / Patch, Result Surface, Session / Continue.
- Evidence emitted: `edit-repair-planner:*`, `verification-repair-loop:*`, mutation not-run, mutation authority not-granted.
- Result surface emitted: no-write repair result or handoff readiness.
- What it proves: failed verification/apply can produce safe repair planning evidence.
- What it does not prove: automatic repair mutation.
- Status: focused-test-only.

## Session / Continue Path

- Entrypoint: `/resume`, `/continue`, `runResumeLikeShellAction`, `SessionManager.buildContinuitySnapshot`.
- Major steps: resolve target session -> trust boundary -> switch runtime session/project context -> render stopped guidance when needed -> run follow-up with continuity snapshot or runtime seed.
- Modules involved: CLI / UX, Session / Continue, Result Surface, Agent Loop.
- Evidence emitted: stopped guidance lines, failure handoff, changed/failed/planned files, writer-started/write-effect, verification blocker.
- Result surface emitted: continuation terminal display and future prompt context.
- What it proves: stopped context can be replayed into next turn surfaces.
- What it does not prove: all long live-provider sessions compact correctly.
- Status: focused-test-only.

## Browser Path

- Entrypoint: `detectWorkflowBrowserPlan`, `executeBrowserModulePlan`.
- Major steps: detect browser plan -> if continuation only project continuation result -> if transaction plan run browser transaction -> else dispatch browser tools and project observations.
- Modules involved: Browser, Tool runtime, Runtime, Result Surface, Session / Continue.
- Evidence emitted: browser transaction/observation/cleanup/redaction markers.
- Result surface emitted: browser runtime outcome projection.
- What it proves: browser module has local planning/execution surfaces.
- What it does not prove: external/public live browser readiness in Route 201.
- Status: scaffold-only / focused-test-only depending gate; no browser gate run here.

## Verifier Script Path

- Entrypoint: package scripts invoking `scripts/verify-*.mjs` or `scripts/verify/index.mjs`.
- Major steps: parse flags -> select cases/tier/suite -> enforce safety/dry-run/opt-in boundaries -> create isolated fixtures -> run focused tests or CLI/runtime commands -> write reports/markers -> cleanup/residue handling.
- Modules involved: Harness / Eval, CLI / UX, Edit / Patch, Provider / Model, Result Surface, Session / Continue.
- Evidence emitted: gate name, markers, status taxonomy, report fields, realProviderTouched flags.
- Result surface emitted: process exit code plus stdout markers/report.
- What it proves: gate-specific contracts only.
- What it does not prove: broad release unless the gate explicitly says so.
- Status: deterministic/focused/default-safe depending command.

## Required Script Comparison

| Script | Provider evidence | Apply evidence | Verification evidence | Current Route 201 interpretation |
|---|---:|---:|---:|---|
| `scripts/verify-real-provider-anchored-smoke.mjs` | Route 199 user-observed `provider-called=true` for `openai-compatible`; script/runner print provider-called/output-validation/anchor-quality/no-write markers | none; no-write only | none; output validation and anchoring only | live provider-called exact-ready no-write evidence |
| `scripts/verify-real-provider-task-loop-mvp.mjs` | Route 200 user-observed `provider-called=false`; runner can print provider/apply/verification markers but observed state stopped | `apply=not-run` | `verification=not-run` | stopped task-loop surface, not live task-loop success |
