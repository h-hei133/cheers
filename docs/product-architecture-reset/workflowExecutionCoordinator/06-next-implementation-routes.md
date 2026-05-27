# Next Implementation Routes

The file is a partial new monolith, but the next work should be grouped by behavior risk rather than split into many tiny moves. The best route order is below.

## Route 1: Edit Activation And Write Authority

Move discovery edit, target-set edit, and fenced replacement activation into edit-owned runtime stages.

Why first:

- It removes write authority composition from runtime without touching the entire mutation/verification tail.
- The behavior has focused adjacent tests.
- It reduces default-write and approval drift risk early.

Files likely touched:

- `packages/ts-shell/src/runtime/workflowExecutionCoordinator.ts`
- `packages/ts-shell/src/edit/discoveryEditRuntimeStage.ts`
- `packages/ts-shell/src/edit/fencedEditRuntimeStage.ts`
- Focused edit stage tests.

Stop before:

- Renaming public entrypoints.
- Moving primary mutation/cross-file repair.
- Changing package scripts.

## Route 2: Context Read And Repo Explain

Move read-file, inspect-files, repo-explain, and context-planning read delivery into context-owned stages.

Why second:

- It is mostly read-only and lower write-safety risk.
- It shrinks the execution function substantially.
- It clarifies no-write context behavior before mutation routes.

Files likely touched:

- `packages/ts-shell/src/context/readRuntimeStage.ts`
- `packages/ts-shell/src/context/inspectFilesStage.ts`
- `packages/ts-shell/src/context/repoExplainRuntimeStage.ts`
- Existing context projection tests plus focused runtime tests.

Stop before:

- Changing repo diagnosis taxonomy.
- Adding browser owner moves.
- Moving session persistence.

## Route 3: Mutation Runtime And Cross-File Repair

Move primary mutation, low-risk rename, secondary writes, and cross-file repair into edit/repair-owned stages that return explicit receipts.

Why third:

- This is the biggest write-safety concentration.
- It should happen after read/context and edit activation surfaces are clearer.
- It can preserve the existing mutation result aggregator while reducing runtime ownership.

Files likely touched:

- `packages/ts-shell/src/edit/mutationRuntimeStage.ts`
- `packages/ts-shell/src/edit/lowRiskRenameStage.ts`
- `packages/ts-shell/src/edit/secondaryWriteStage.ts`
- `packages/ts-shell/src/repair/crossFileRepairStage.ts`
- Existing edit/repair planners and tests.

Stop before:

- Introducing multi-file/add/delete/move support beyond existing behavior.
- Weakening stale-read or explicit approval checks.
- Reclassifying partial repair as success.

## Route 4: Verification And Result/Evidence Handoff

Move low-risk verification, command verification retry, skipped/not-requested projection, and final result contract assembly behind verification/result/evidence facades.

Why fourth:

- It is high truthfulness risk and should follow earlier stage extractions so inputs are cleaner.
- It is the route that should prove Route221 anti-false-success compatibility.
- It should align with the product-owned evidence/verdict facade.

Files likely touched:

- `packages/ts-shell/src/verification/lowRiskVerificationStage.ts`
- `packages/ts-shell/src/verification/commandVerificationStage.ts`
- `packages/ts-shell/src/result/workflowRuntimeProjection.ts`
- `packages/ts-shell/src/evidence/verdictFacade.ts`
- Result and evidence tests.

Stop before:

- Changing terminal taxonomy.
- Moving report paths.
- Importing route reports or docs into product runtime.

## Route 5: Continuation Residue Cleanup

After the execution body is smaller, prove which local continuation helpers are live. Move live helpers to planning/repair/evidence owners and delete dead residue.

Why last:

- Some helpers appear to be left behind after `buildWorkflowTaskPlan` moved.
- Cleanup is safest after behavior-owning stages no longer depend on runtime locals.

Files likely touched:

- `packages/ts-shell/src/planning/workflowTaskPlan.ts`
- `packages/ts-shell/src/repair/continuationRepairStage.ts`
- `packages/ts-shell/src/evidence/continuationTransformEvidence.ts`
- `packages/ts-shell/src/core/paths/*` only for concrete path ownership.

Stop before:

- Using a generic helper bucket.
- Moving code into `turn/` without a genuine turn-level contract.
- Deleting helpers without build/reference proof.

## Safe-To-Start Recommendation

Safe to start implementation after this audit: yes, with Route 1 only. Do not start with verification/result truthfulness or mutation/cross-file repair unless the route explicitly budgets for broader regression validation. Do not execute live provider for these extraction routes.

