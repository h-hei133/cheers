# Phase 3 runMvp Route 3: Context Delivery, Mutation Planning, And Repair Extraction

## Purpose

Continue extracting:

packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts

Route 1 extracted runtime shell and handoff surfaces.
Route 2 extracted planning/target/policy projections and repo-explain projection.

Route 3 combines the next compatible ownership areas:

1. Context read delivery and read continuation.
2. Edit/mutation planning and authority-adjacent extraction.
3. Repair planning and repair continuation extraction.

These areas may be handled in one goal because they sit between planning output and verification/result projection. They must still be implemented as strict internal checkpoints.

This route must produce visible code movement out of runMvpIntegratedFlow.ts. It must not create generic helper files or use turn/ as a dumping bucket.

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
- current context, edit, repair, policy, result, session, proposal, verification modules
- Route 1 and Route 2 changes

Use current code as truth.

## Core Rule: Destination By Ownership

Do not use turn/stages as a generic destination.

Do not create vague files:

- helper
- helpers
- utils
- misc
- common
- support
- mvp

Use real owner modules:

- context/
- edit/
- repair/
- policy/
- result/
- session/
- proposal/
- evidence/
- shared/

turn/ is allowed only for thin coordination, not for read delivery, mutation planning, repair planning, authority, or result ownership.

## Goal

Move context delivery, mutation planning, and repair planning responsibilities out of runMvpIntegratedFlow.ts into owner modules.

Expected owner destinations, subject to inspection:

- context/readDeliveryProjection.ts
- context/readWindowContinuation.ts
- context/repoInspectStage.ts
- result/groundedDeliveryProjection.ts
- edit/mutationInstructionPlanner.ts
- edit/mutationTargetSelection.ts
- edit/lowRiskMutationPlanner.ts
- edit/staleReadMutationStage.ts
- edit/discoveryEditStage.ts
- edit/fencedEditStage.ts
- policy/mutationAuthorityGate.ts
- repair/singleFileRepairContext.ts
- repair/crossFileRepairPlanning.ts
- repair/degradedReopenPlanning.ts
- repair/groundedAnswerRepair.ts
- repair/stagedRepairProjection.ts

If files already exist, integrate into them instead of duplicating.

## Required Scope

This route should move all three categories unless a checkpoint blocks:

1. One meaningful context/read delivery family.
2. One meaningful edit/mutation planning family.
3. One meaningful repair/continuation planning family.

If any category cannot be safely moved, stop at that checkpoint and report PARTIAL. Do not hide it by doing only the easy category.

## Strict Non-Goals

Do not extract verification execution in this route.

Do not extract final result/evidence terminal projection in this route except narrow delivery projection owned by result/context.

Do not deeply rewrite executeWorkflowTaskPlan.

Do not change product behavior.

Do not run live provider.

Do not change provider defaults.

Do not change production write defaults.

Do not weaken evidence/verdict truthfulness.

Do not infer write authority from prompt text.

Do not skip stale-read protection.

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

### Checkpoint B: Context Read And Delivery Extraction

Move meaningful read/context delivery code.

Candidates, subject to ownership audit:

- buildReadTaskDelivery
- buildSingleGroundedDelivery
- inspect files delivery helpers
- read window helpers
- fragment reanchor/fingerprint helpers
- grounded delivery projection
- line window continuation

Must preserve:

- read-only changedFiles=[]
- no provider config consumption on no-write inspect
- grounded delivery requirements
- report-safe output
- no read-only success without grounded content

### Checkpoint C: Edit And Mutation Planning Extraction

Move meaningful mutation planning code.

Candidates, subject to ownership audit:

- mutation instruction resolution
- mutation target selection
- fenced/replace/transform parsing
- scoped replace directive
- line-scoped repair edit planning
- low-risk generated content
- secondary write planning
- stale-read/readback-adjacent planning if safe

Must preserve:

- explicit write authority
- no prompt-text write authorization
- no production write default
- dry-run/no-write/preview semantics
- stale-read protection
- exact patch failure codes

### Checkpoint D: Repair Planning And Continuation Extraction

Move meaningful repair planning code.

Candidates, subject to ownership audit:

- single-file repair context
- cross-file repair candidate derivation
- degraded reopen planning
- grounded answer repair normalization
- staged repair parsing/projection
- remaining/failed/skipped repair facts

Must preserve:

- continuation does not create success
- repair proposal is not repair success
- repair apply without re-verification is not success
- original failure evidence remains visible
- cross-file remaining/failed/skipped evidence is not hidden

### Checkpoint E: Validation And Audit

Run validation and list remaining runMvp responsibilities.

## Compatibility Requirements

Old runMvp public imports must keep working.

If tests or modules need legacy symbol access, keep compatibility through narrow re-export shims.

Do not expose regex internals as broad public APIs unless necessary.

## Validation

Required:

- npm test -w packages/ts-shell -- src/orchestration/runMvpIntegratedFlow.test.ts
- focused tests for moved context/edit/repair modules
- edit facade tests if edit ownership moves
- repair facade tests if repair ownership moves
- fenced edit activation tests if fenced edit logic moves
- workspace authority/write policy tests if authority-adjacent code moves
- stopped session continuity tests if continuation facts move
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
- at least one context/read delivery family moved
- at least one edit/mutation planning family moved
- at least one repair/continuation planning family moved
- extracted code placed in real owner modules, not generic turn/helper buckets
- full runMvp suite passes
- result contract and Route221 gate pass
- no write authority, stale-read, repair, or read-only truthfulness drift
- remaining runMvp responsibilities listed

PARTIAL if:

- only one or two categories land
- full runMvp suite fails
- movement uses generic buckets
- behavior compatibility is uncertain

BLOCKED if:

- safe extraction requires verification/result extraction first
- ownership cannot be determined safely
- compatibility exports cannot be preserved

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

phase3-runmvp-route3:

Do not push.

## Final Report

Include:

1. Final status
2. Ownership audit summary
3. Context/read families moved
4. Edit/mutation families moved
5. Repair families moved
6. Target owner modules
7. Compatibility shims/exports
8. Product behavior changed yes/no
9. Truthfulness impact
10. Validation results
11. Serena usage
12. Remaining runMvp responsibilities
13. Commit hash if committed
14. Whether it is safe to start route 4
