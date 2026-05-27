# Phase 3 runMvp Route 5: Workflow Plan, Execution Coordinator, And Wrapper Cleanup

## Purpose

Finish the main extraction of:

packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts

Routes 1-4 extracted runtime shell, handoff surfaces, planning/context projections, mutation/repair/verification/result owner modules.

Route 5 now handles the remaining core:

1. buildWorkflowTaskPlan ownership.
2. executeWorkflowTaskPlan / main execution sequencing ownership.
3. legacy wrapper cleanup.

This route is aggressive by design. It should make runMvpIntegratedFlow.ts a small compatibility wrapper if safely possible.

## Required Reading

Read before editing:

- docs/product-architecture-reset/runMvp/README.md
- docs/product-architecture-reset/runMvp/00-runmvp-current-map.md
- docs/product-architecture-reset/runMvp/01-runmvp-ownership-zones.md
- docs/product-architecture-reset/runMvp/02-runmvp-extraction-targets.md
- docs/product-architecture-reset/runMvp/03-runmvp-stay-vs-move.md
- docs/product-architecture-reset/runMvp/04-runmvp-extraction-order.md
- docs/product-architecture-reset/runMvp/05-runmvp-validation-plan.md
- docs/product-architecture-reset/runMvp/06-runmvp-risk-register.md
- current runMvpIntegratedFlow.ts
- current runMvpIntegratedFlow.test.ts
- current planning, runtime, context, edit, verification, repair, evidence, result, policy, provider, proposal, browser modules
- Route 1-4 moved owner modules and tests

Use current code as truth.

## Core Rule: Destination By Ownership

Do not create generic dumping buckets.

Forbidden destination names:

- helper
- helpers
- utils
- misc
- common
- support
- mvp
- stages as a dumping ground

Use real owner modules:

- planning/
- runtime/
- context/
- provider/
- proposal/
- edit/
- verification/
- repair/
- evidence/
- result/
- policy/
- browser/
- mcp/
- tools/
- session/
- shared/

`turn/` is allowed only for thin top-level request coordination. If used, it must not own planning policy, mutation policy, verification semantics, repair semantics, evidence truth, or provider logic.

## Goal

Make runMvpIntegratedFlow.ts a compatibility wrapper or near-wrapper.

The final file should ideally keep only:

- legacy public exports
- type re-exports if needed
- thin delegation to the owner runtime/coordinator
- compatibility comments if needed

It should no longer own:

- workflow task planning
- main execution sequencing
- branch dispatch policy
- provider/proposal/planning handoff policy
- mutation/write policy
- verification/repair/result policy
- context/read delivery policy

## Required Scope

This route should complete all three categories unless blocked:

1. Move buildWorkflowTaskPlan and remaining plan contracts to planning-owned modules.
2. Move executeWorkflowTaskPlan and main execution sequencing to a runtime/coordinator owner that delegates to domain modules.
3. Clean runMvpIntegratedFlow.ts into a compatibility wrapper.

If any category cannot be safely completed, stop at that checkpoint and report PARTIAL. Do not hide by doing only easy cleanup.

## Expected Owner Destinations

Subject to current inspection:

- planning/workflowTaskPlan.ts
- planning/workflowExecutionPlan.ts
- planning/workflowPlanTypes.ts
- runtime/workflowExecutionCoordinator.ts
- runtime/workflowExecutionTypes.ts
- result/workflowRuntimeProjection.ts
- evidence/turnEvidenceLedger.ts
- context/readDeliveryProjection.ts
- edit/mutationExecutionStage.ts
- verification/verificationStage.ts
- repair/crossFileRepairStage.ts
- browser/browserExecutionStage.ts

If a file already exists, integrate into it instead of duplicating.

## Strict Non-Goals

Do not add features.

Do not run live provider.

Do not change provider defaults.

Do not change production write defaults.

Do not infer write authority from prompt text.

Do not skip stale-read protection.

Do not weaken evidence/verdict truthfulness.

Do not convert stopped, blocked, partial, skipped, not-run, no-provider, or not-proven into success.

Do not move route docs/reports/package scripts.

Do not split SessionManager or CLI.

Do not mass-format unrelated code.

## Required Checkpoints

### Checkpoint A: Ownership Audit Before Edits

Before editing, produce an in-thread table:

- symbol/region
- current responsibility
- real owner domain
- target file
- why not turn/
- compatibility strategy
- tests
- stop risk

No edits before this table exists.

### Checkpoint B: Workflow Plan Extraction

Move buildWorkflowTaskPlan and remaining planning contracts out of runMvpIntegratedFlow.ts.

Must preserve:

- WorkflowTaskPlan shape
- read/diagnosis routing
- write-intent classification
- command blocker behavior
- continuation planning
- target resolution behavior
- planning runtime no-write handoff
- current evidence strings unless intentionally owned by a migrated projection

### Checkpoint C: Execution Coordinator Extraction

Move executeWorkflowTaskPlan and main branch sequencing out of runMvpIntegratedFlow.ts into a real runtime/coordinator owner.

The coordinator may orchestrate domain modules, but must not re-own domain logic.

Must preserve:

- branch dispatch order
- no-write/read-only behavior
- provider/no-provider behavior
- mutation authority
- verification status distinctions
- repair evidence
- result projection parity
- stream/non-stream parity

### Checkpoint D: Legacy Wrapper Cleanup

Reduce runMvpIntegratedFlow.ts to compatibility wrapper or near-wrapper.

Allowed contents:

- imports of owner entrypoints/types
- legacy export names
- thin delegates
- compatibility type aliases
- minimal compatibility comments

If some local code must remain, list exact reasons and owner target.

### Checkpoint E: Validation And Audit

Run all required validation and list remaining local responsibilities.

## Compatibility Requirements

Old public imports must keep working:

- orchestration/runMvpIntegratedFlow.js
- runMvpIntegratedFlow
- streamMvpIntegratedFlow
- MvpIntegratedFlowOptions
- ApplyPatchRuntimeRouteOptions

Legacy tests may keep importing the old path.

No product runtime may import docs/scripts/dev-history.

## Validation

Required:

- npm test -w packages/ts-shell -- src/orchestration/runMvpIntegratedFlow.test.ts
- focused tests for moved planning/runtime modules
- existing focused tests for context/edit/verification/repair/evidence/result modules touched by coordinator
- npm run verify:result-contract
- npm run verify:route221-anti-false-success-gate
- npm run build -w packages/ts-shell
- product/runtime import scan for docs/scripts/dev-history leakage
- git diff --check
- git status --short --branch

Run if relevant:

- verify:product:cli-entry if entrypoint output changes
- turn facade tests if public run/stream entrypoint imports change
- browser gate if browser execution stage changes
- fenced/workspace/stopped-continuity tests if mutation/repair sequencing changes

Do not run live provider.

## Completion Criteria

COMPLETE requires:

- ownership audit table completed before edits
- buildWorkflowTaskPlan moved to planning-owned module
- executeWorkflowTaskPlan/main sequencing moved to runtime/coordinator owner
- runMvpIntegratedFlow.ts reduced to compatibility wrapper or near-wrapper
- no generic turn/helper buckets used
- full runMvp suite passes
- result contract and Route221 gate pass
- build passes
- no truthfulness/redaction drift
- remaining runMvp local code listed with reason

PARTIAL if:

- only planning or only execution moves
- wrapper still owns significant policy
- full runMvp suite fails
- behavior compatibility is uncertain

BLOCKED if:

- safe movement requires product behavior redesign
- ownership cannot be determined safely
- compatibility exports cannot be preserved
- truthfulness or redaction would be weakened

## Serena Policy

Use Serena if available for:

- symbol overview
- find symbol
- find references
- impact analysis
- ownership clustering

Do not use Serena as validation replacement.

If onboarding asks for memory writes and memory updates are not needed, skip onboarding and continue.

## Commit

Commit if green.

Suggested prefix:

phase3-runmvp-route5:

Do not push.

## Final Report

Include:

1. Final status
2. Ownership audit summary
3. Planning functions moved
4. Execution coordinator moved
5. Wrapper cleanup result and line count
6. Target owner modules
7. Compatibility exports/shims
8. Product behavior changed yes/no
9. Truthfulness impact
10. Validation results
11. Serena usage
12. Remaining runMvp responsibilities
13. Commit hash if committed
14. Whether runMvp extraction is complete or needs route 6
