# Extraction Targets

These are grouped for future implementation. They intentionally avoid `helper`, `utils`, `misc`, `common`, `support`, `mvp`, and `turn/` dumping buckets.

## Route 1: Edit Activation And Write Authority Stage

Purpose: remove discovery edit, target-set edit, fenced replacement activation, workspace authority construction, and edit-route result assembly from runtime.

Source regions:

- Lines 565-786: discovery edit request, `planDiscoveryEdit`, target-set permission loop, `runTargetSetEditRoute`, fenced edit route.
- Lines 707-786: `selectFencedEditReplacementActivation` branch and route result.

Destination:

- `packages/ts-shell/src/edit/discoveryEditRuntimeStage.ts`
- `packages/ts-shell/src/edit/fencedEditRuntimeStage.ts`
- Existing `packages/ts-shell/src/orchestration/editPatchModule.ts` may keep route exports until a later physical move.

Compatibility strategy:

- Keep `workflowExecutionCoordinator.ts` calling a single edit-owned stage facade.
- Preserve returned `events`, `notes`, `codingResult`, and `userFacingOutput`.
- Do not change `orchestration/runMvpIntegratedFlow.ts` imports.
- Do not change package scripts.

Tests:

- `npm test -w packages/ts-shell -- src/orchestration/fencedEditRuntimeActivation.test.ts`
- Targeted `runMvpIntegratedFlow.test.ts` cases for discovery/fenced/target-set behavior.
- Add `edit/discoveryEditRuntimeStage.test.ts` and `edit/fencedEditRuntimeStage.test.ts` only if behavior is moved.
- `npm run build -w packages/ts-shell`.

Stop conditions:

- If write permission, default no-write, denied approval, stale-read, or stopped result semantics change.
- If stream and non-stream apply-patch/fenced terminal behavior diverge.
- If import cycles appear between `runtime/` and `edit/`.

## Route 2: Context Read, Inspect, Repo Explain Stage

Purpose: move read-only context execution branches out of runtime while preserving no-write and grounded-delivery behavior.

Source regions:

- Lines 915-1135: inspect-first read and read-file delivery.
- Lines 1162-1233: inspect-files branch.
- Lines 1235-1435: repo-explain branch.
- Blocked/context-planning fragments from lines 802-849 and read-context planning from lines 1040-1097.

Destination:

- `packages/ts-shell/src/context/readRuntimeStage.ts`
- `packages/ts-shell/src/context/inspectFilesStage.ts`
- `packages/ts-shell/src/context/repoExplainRuntimeStage.ts`
- Existing `context/readDeliveryProjection.ts`, `context/repoExplainStage.ts`, and context graph modules remain domain owners.

Compatibility strategy:

- The runtime stage returns `WorkflowExecutionResult`-compatible data.
- Keep the same read/glob tool event names and task ids where tests assert them.
- Preserve no-write behavior and `verification.status: "not-requested"` for read-only completion.

Tests:

- `npm test -w packages/ts-shell -- src/context/readDeliveryProjection.test.ts src/context/readWindowContinuation.test.ts src/context/repoExplainStage.test.ts`
- Targeted `runMvpIntegratedFlow.test.ts` read/repo-explain/inspect cases.
- `workflowExecutionCoordinator.test.ts`.

Stop conditions:

- If read-only prompts begin requesting bash/write approval.
- If missing/ambiguous target stops become success.
- If repo diagnosis loses `needs-verification` caveat.

## Route 3: Mutation Runtime And Repair Stage

Purpose: remove primary edit/write mutation planning, low-risk rename, secondary writes, and cross-file repair execution from runtime.

Source regions:

- Lines 1437-1806: primary mutation planning, repair replan, stale transform handling, mutation instruction failure.
- Lines 1808-1909: primary mutation dispatch.
- Lines 1911-2053: low-risk rename and secondary writes.
- Lines 2055-2337: cross-file repair execution, degradation, remaining/failed/skipped evidence.
- Lines 3157-3255: transform evidence helpers if still referenced after stage split.

Destination:

- `packages/ts-shell/src/edit/mutationRuntimeStage.ts`
- `packages/ts-shell/src/edit/lowRiskRenameStage.ts`
- `packages/ts-shell/src/edit/secondaryWriteStage.ts`
- `packages/ts-shell/src/repair/crossFileRepairStage.ts`
- `packages/ts-shell/src/repair/continuationTransformEvidence.ts` or `packages/ts-shell/src/evidence/continuationTransformEvidence.ts` depending on whether the exported API is executable repair input or report-safe evidence parsing.

Compatibility strategy:

- Return a mutation receipt object containing changed/failed/patches/appliedContent/provenance/evidence/repair state.
- Runtime only appends the returned receipt to a result projection.
- Preserve exact false-success boundaries: partial, failed, stale, skipped, blocked, and degraded outcomes must not become success.

Tests:

- Targeted `runMvpIntegratedFlow.test.ts` edit/write/stale-read/patch failure/cross-file repair cases.
- `npm test -w packages/ts-shell -- src/edit/mutationInstructionPlanner.test.ts src/edit/mutationTargetSelection.test.ts`
- Repair tests covering cross-file degradation and grounded answer repair where applicable.
- `npm run verify:result-contract`.

Stop conditions:

- If stale-read before write is skipped.
- If prompt text implies write authorization.
- If cross-file remaining targets are lost or partial failure upgrades to success.
- If transform evidence re-consumes stale blocker evidence as executable proof.

## Route 4: Verification Stage And Result Truth Handoff

Purpose: move verification status semantics and final evidence/result assembly out of runtime.

Source regions:

- Lines 2361-2859: low-risk verification, command verification retry, skipped/unavailable/not-requested status handling.
- Lines 2861-2941: repair fallback and final `projectWorkflowRuntimeResultContract` handoff assembly.
- Lines 861-913: verify hint evidence can move with stage receipts.

Destination:

- `packages/ts-shell/src/verification/lowRiskVerificationStage.ts`
- `packages/ts-shell/src/verification/commandVerificationStage.ts`
- `packages/ts-shell/src/result/workflowRuntimeProjection.ts`
- `packages/ts-shell/src/evidence/verdictFacade.ts` for stable evidence/verdict receipt concepts.

Compatibility strategy:

- Use a stage receipt that records verification status, reason, blocker kind, next action, verified/unverified files, evidence, and provenance.
- Runtime passes receipts to result/evidence facade.
- Keep Route221 anti-false-success behavior and Route227/228 report compatibility indirectly through result contract gates.

Tests:

- `npm test -w packages/ts-shell -- src/verification/commandStage.test.ts src/result/workflowRuntimeProjection.test.ts src/evidence/verdictFacade.test.ts`
- Targeted `runMvpIntegratedFlow.test.ts` verification cases.
- `npm run verify:result-contract`
- `npm run verify:route221-anti-false-success-gate`
- `npm run build -w packages/ts-shell`

Stop conditions:

- If `not-requested`, `skipped`, `blocked`, `failed`, `partial`, or `not-proven` outcomes collapse into success.
- If changed files without verification are marked verified.
- If command approval denial becomes command success.

## Route 5: Continuation Residue And Planning Helper Cleanup

Purpose: remove or rehome helper predicates and transform parsing that no longer belong in runtime after `buildWorkflowTaskPlan` moved to `planning/`.

Source regions:

- Lines 2944-3155: prompt follow-up predicates and `extractKeyTerms`.
- Lines 3157-3279: `inferReplaceDirectiveFromContinuity`, `parseTransformEvidence`, `collectContinuationTransforms`, `shouldBlockMutationForTargetResolution`, `normalizePathLike`.

Destination:

- `packages/ts-shell/src/planning/workflowTaskPlan.ts` for live planning predicates.
- `packages/ts-shell/src/repair/continuationRepairStage.ts` for repair follow-up predicates.
- `packages/ts-shell/src/evidence/continuationTransformEvidence.ts` for parsing evidence strings if shared across planning/repair.
- `packages/ts-shell/src/core/paths/legacyRootRebase.ts` or another concrete path owner only for path rebasing/normalization that is already in use.

Compatibility strategy:

- First prove which helpers are live with TypeScript diagnostics or direct references.
- Move live helpers with matching tests.
- Delete dead helpers in a separate cleanup only after build proves no references.

Tests:

- `npm test -w packages/ts-shell -- src/planning/workflowTaskPlan.test.ts`
- Continuation-focused `runMvpIntegratedFlow.test.ts` cases.
- `npm run build -w packages/ts-shell`.

Stop conditions:

- If continuation prompt routing changes.
- If migrated-root path rebasing changes.
- If stale transform evidence becomes executable again.

