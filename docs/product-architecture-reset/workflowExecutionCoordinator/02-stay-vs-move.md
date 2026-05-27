# Stay Vs Move

| Symbol/region | Stay? | Move? | Split? | Delete/deprecate later? | Final destination | Reason |
| --- | --- | --- | --- | --- | --- | --- |
| Legacy orchestration wrapper | Yes | No | No | Later rename only after consumer migration | `orchestration/runMvpIntegratedFlow.ts` | Current public import path must remain compatible. |
| `MvpIntegratedFlowOptions` | Yes | Later | Yes | Deprecate name later | `runtime/` then product turn facade | Active compatibility contract despite stale name. |
| `runMvpIntegratedFlow` | Yes | No | No | Rename later behind compatibility | `runtime/workflowExecutionCoordinator.ts` | Legitimate entrypoint coordination. |
| `streamMvpIntegratedFlow` | Yes | No | No | Rename later behind compatibility | `runtime/workflowExecutionCoordinator.ts` | Legitimate stream entrypoint coordination. |
| Apply-patch bridge in entrypoints | Yes | Later | No | No | `edit/applyPatchRuntimeBridge.ts` remains owner | Runtime may coordinate early terminal bridge for stream/non-stream parity. |
| Environment setup and `environment.close()` | Yes | No | No | No | `runtime/integratedFlowEnvironment.ts` called by coordinator | Runtime lifecycle ownership. |
| `createIntegratedRunner` role shell | Yes | Later | Yes | No | `runtime/` role runner | It coordinates planner/coder/reviewer handoffs. |
| Chat/provider branch inside runner | Temporarily | Maybe | Yes | No | `provider/providerDraftStage.ts`, `context/continuationPlanning.ts` | Should become stage calls, but lower risk than execution monolith. |
| `executeWorkflowTaskPlan` as one function | No | Yes | Yes | No | Multiple owner stages | It is the new concentration point. |
| Planning runtime and anchored proposal calls | Yes | No | No | No | Owners stay `planning/`, `proposal/` | Runtime should only call these stages. |
| Discovery edit/fenced edit activation | No | Yes | Yes | No | `edit/discoveryEditRuntimeStage.ts`, `edit/fencedEditRuntimeStage.ts` | Owns edit route selection, permission decisions, and result projection. |
| Workspace authority creation for edit routes | No | Yes | Yes | No | `edit/` stage using `patchResult/workspaceAuthority.ts` | Runtime must not own write authority policy. |
| Blocked/context planning projection | Partially | Yes | Yes | No | `context/`, `planning/`, `result/` | Runtime can route blocked branch; owners should project details. |
| Browser branch | Yes | Later maybe | No | No | `browser/` owner if created | Thin branch delegation is acceptable. |
| Reopen/verify hint evidence | No | Yes | Yes | No | `evidence/`, `verification/`, `planning/` | Runtime must not own evidence truth rules. |
| Inspect-first/read-file branch | No | Yes | Yes | No | `context/readRuntimeStage.ts`, `edit/editVerificationPreflight.ts` | Read delivery and protected snapshots are domain behavior. |
| Inspect-files branch | No | Yes | No | No | `context/inspectFilesStage.ts` | Context inspect route should own glob/delivery/failure. |
| Repo-explain branch | No | Yes | No | No | `context/repoExplainRuntimeStage.ts` | Target selection and diagnosis metadata are context domain logic. |
| Primary mutation planning | No | Yes | Yes | No | `edit/mutationRuntimeStage.ts`, `repair/continuationRepairStage.ts` | Runtime must not own mutation instruction or repair strategy. |
| Primary mutation dispatch closure | Partially | Yes | Yes | No | `edit/mutationRuntimeStage.ts` | Runtime can provide dispatcher/enforcer; edit stage should own write route assembly. |
| Low-risk rename and secondary writes | No | Yes | Yes | Maybe for unsupported secondary behavior | `edit/lowRiskRenameStage.ts`, `edit/secondaryWriteStage.ts` | Edit/refactor expansion belongs to edit owner. |
| Cross-file repair loop | No | Yes | No | No | `repair/crossFileRepairStage.ts` | Repair strategy and partial/degraded semantics belong to repair owner. |
| Direct command stage call | Yes | No | No | No | `verification/commandStage.ts` | Current code delegates enough. |
| Low-risk verification block | No | Yes | No | No | `verification/lowRiskVerificationStage.ts` | Verification status and readback truth are verification owner. |
| Command verification retry loop | Temporarily | Yes | Yes | No | `verification/commandVerificationStage.ts` | Keep parity, but retry/evidence semantics should move. |
| Final result contract handoff assembly | No | Yes | Yes | No | `result/workflowRuntimeProjection.ts`, `evidence/verdictFacade.ts` | Runtime should pass stage receipts, not assemble truth manually. |
| Prompt follow-up regex helpers | No | Yes if live, delete if dead | Yes | Yes after reference check | `planning/workflowTaskPlan.ts`, `repair/`, or remove | Runtime no longer owns planning intent. |
| Transform evidence helpers | No | Yes | Yes | No | `evidence/` parser plus `repair/` consumer | Evidence strings must not become executable in runtime by accident. |
| Mutation type guard | No | Yes | No | No | `edit/mutationInstructionPlanner.ts` | Edit owner should expose its adapter guard. |
| Target-resolution mutation blocker | No | Yes | No | No | `planning/workflowTaskPlan.ts` or `orchestration/targetResolution.ts` | Target policy is not runtime coordination. |

## What Should Stay In Runtime

- Public non-stream and stream entrypoint compatibility.
- Environment creation and cleanup.
- Multi-agent orchestrator invocation.
- Role runner shell while the current orchestrator contract requires planner/coder/reviewer callbacks.
- Thin dispatch to domain stages.
- Stream/non-stream parity handling for terminal apply-patch bridge.

## What Should Not Stay In Runtime

- Any rule that determines write authorization, mutation instruction, target selection policy, verification status, repair/degradation outcome, evidence truth, terminal verdict, read delivery semantics, or repo diagnosis metadata.

