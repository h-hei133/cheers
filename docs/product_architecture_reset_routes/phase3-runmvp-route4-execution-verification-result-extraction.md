# Phase 3 runMvp Route 4: Execution, Verification, Repair, And Result Extraction

## Purpose

Continue extracting:

packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts

Routes 1-3 moved runtime shell, handoff surfaces, planning/policy projections, context read-window helpers, mutation target selection, and grounded repair planning.

Route 4 is the aggressive execution-chain route.

It combines the remaining compatible execution areas:

1. context delivery completion
2. edit/mutation instruction and write execution planning
3. verification and direct command execution
4. repair execution and cross-file repair projection
5. evidence/result/terminal projection

This route must produce visible code movement out of runMvpIntegratedFlow.ts.

This route must not use `turn/` or `turn/stages/` as a generic bucket. Destination is by real ownership.

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
- current context, edit, verification, repair, evidence, result, policy, session, proposal modules
- Route 1, Route 2, and Route 3 changes

Use current code as truth.

## Core Rule: Destination By Ownership

Do not create vague files:

- helper
- helpers
- utils
- misc
- common
- support
- mvp
- stages as a dumping ground

Use real owner modules:

- context/
- edit/
- verification/
- repair/
- evidence/
- result/
- policy/
- session/
- proposal/
- shared/

`turn/` is allowed only for thin turn coordination. This route should normally not add code there.

## Goal

Move the execution-chain responsibilities out of runMvpIntegratedFlow.ts into owner modules.

Expected owner destinations, subject to inspection:

- context/readDeliveryProjection.ts
- result/groundedDeliveryProjection.ts
- edit/mutationInstructionPlanner.ts
- edit/lowRiskMutationPlanner.ts
- edit/staleReadMutationStage.ts
- edit/discoveryEditStage.ts
- edit/fencedEditStage.ts
- edit/mutationExecutionStage.ts
- policy/mutationAuthorityGate.ts
- verification/verifyCommandIntent.ts
- verification/verificationStage.ts
- verification/contentAssertionVerification.ts
- verification/consistencyVerification.ts
- policy/commandAuthorityGate.ts
- repair/crossFileRepairStage.ts
- repair/crossFileRepairPlanning.ts
- repair/stagedRepairProjection.ts
- evidence/freshnessEvidence.ts
- evidence/turnEvidenceLedger.ts
- result/workflowRuntimeProjection.ts
- result/terminalVerdictProjection.ts
- session/turnContinuationFacts.ts

If files already exist, integrate into them instead of duplicating.

## Required Scope

COMPLETE requires meaningful movement in all five categories:

1. Context delivery completion.
2. Edit/mutation instruction or execution planning.
3. Verification/direct command execution.
4. Repair execution or cross-file repair projection.
5. Evidence/result/terminal projection.

If a category cannot be safely moved, stop at that checkpoint and report PARTIAL. Do not hide it by only doing easy categories.

## Strict Non-Goals

Do not split buildWorkflowTaskPlan in this route except import/type adjustments caused by moved code.

Do not change product behavior.

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

### Checkpoint B: Context Delivery Completion

Move remaining read/context delivery projection code.

Candidates, subject to ownership audit:

- buildReadTaskDelivery
- buildSingleGroundedDelivery
- inspect/explain/purpose IO delivery
- grounded delivery projection
- read evidence marker assembly

Must preserve:

- read-only changedFiles=[]
- no provider config consumption on no-write inspect
- grounded delivery requirements
- no read-only success without grounded content
- report-safe output

### Checkpoint C: Edit And Mutation Execution Extraction

Move meaningful edit/mutation planning or execution code.

Candidates, subject to ownership audit:

- mutation instruction resolution
- fenced/replace/transform parsing
- scoped replace directive
- line-scoped repair edit planning
- low-risk generated content
- secondary write planning
- stale-read/readback branch
- discovery/fenced edit execution branch
- mutation execution dispatch wrapper

Must preserve:

- explicit write authority
- no prompt-text write authorization
- no production write default
- dry-run/no-write/preview semantics
- stale-read protection
- exact patch failure codes
- protected file handling

### Checkpoint D: Verification And Command Execution Extraction

Move meaningful verification or command execution code.

Candidates, subject to ownership audit:

- direct run-command branch
- command allowlist authority gate
- verify command detection
- verification plan execution
- retry planning
- content assertions
- unchanged-file assertions
- multi-file consistency verification
- verify continuation object planning if still local

Must preserve:

- command blockers remain blockers
- verification not-run/skipped/blocked/failed stay distinct
- apply without verification is not success when verification is required
- one file success cannot hide another file failure

### Checkpoint E: Repair Execution Extraction

Move meaningful repair execution/cross-file repair code.

Candidates, subject to ownership audit:

- cross-file repair execution
- remaining/failed/skipped/degraded projections
- repair rebase handling
- staged repair projection execution
- repair apply/readback evidence handoff

Must preserve:

- continuation does not create success
- repair proposal is not repair success
- repair apply without re-verification is not success
- original failure evidence remains visible
- cross-file remaining/failed/skipped evidence is not hidden

### Checkpoint F: Evidence And Result Projection Extraction

Move meaningful evidence/result/terminal projection code.

Candidates, subject to ownership audit:

- FreshnessObservability
- buildFreshnessObservability
- evidence ledger append patterns
- appendSingleFileEditRepairObservability
- projectWorkflowTurnHandoff integration
- git change-set attribution call
- terminal verdict projection bridge

Must preserve:

- resultSurfaceModule output compatibility
- evidence/verdictFacade semantics
- Route221 anti-false-success behavior
- redaction/report-safe projections
- no false success

### Checkpoint G: Validation And Audit

Run validation and list remaining runMvp responsibilities.

## Compatibility Requirements

Old public imports must keep working:

- orchestration/runMvpIntegratedFlow.js
- runMvpIntegratedFlow
- streamMvpIntegratedFlow
- MvpIntegratedFlowOptions
- ApplyPatchRuntimeRouteOptions

If tests or modules need legacy symbol access, keep compatibility through narrow re-export shims.

Do not expose internal regex or execution internals as broad public APIs unless necessary.

## Validation

Required:

- npm test -w packages/ts-shell -- src/orchestration/runMvpIntegratedFlow.test.ts
- focused tests for moved context/edit/verification/repair/evidence/result modules
- edit facade tests if edit ownership moves
- repair facade tests if repair ownership moves
- verification facade and task-relevant verification tests if verification moves
- fenced edit activation tests if fenced edit logic moves
- workspace authority/write policy tests if authority-adjacent code moves
- stopped session continuity tests if continuation facts move
- evidence/verdict facade tests if evidence/result moves
- npm run verify:result-contract
- npm run verify:route221-anti-false-success-gate
- npm run build -w packages/ts-shell
- product/runtime import scan for docs/scripts/dev-history leakage
- git diff --check
- git status --short --branch

Do not run live provider.

## Completion Criteria

COMPLETE requires:

- ownership audit table completed before edits
- visible code movement out of runMvpIntegratedFlow.ts
- all five required categories have meaningful owner-module extraction
- extracted code placed in real owner modules, not generic turn/helper buckets
- full runMvp suite passes
- result contract and Route221 gate pass
- no read/write/verification/repair/result truthfulness drift
- remaining runMvp responsibilities listed

PARTIAL if:

- fewer than five categories land
- full runMvp suite fails
- movement uses generic buckets
- behavior compatibility is uncertain

BLOCKED if:

- safe extraction requires splitting buildWorkflowTaskPlan first
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

phase3-runmvp-route4:

Do not push.

## Final Report

Include:

1. Final status
2. Ownership audit summary
3. Context delivery families moved
4. Edit/mutation families moved
5. Verification families moved
6. Repair families moved
7. Evidence/result families moved
8. Target owner modules
9. Compatibility shims/exports
10. Product behavior changed yes/no
11. Truthfulness impact
12. Validation results
13. Serena usage
14. Remaining runMvp responsibilities
15. Commit hash if committed
16. Whether it is safe to start route 5
