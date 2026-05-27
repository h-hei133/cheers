# Phase 3 workflowExecutionCoordinator Route 2: Mutation Runtime And Cross-File Repair Extraction

## Purpose

Continue reducing:

packages/ts-shell/src/runtime/workflowExecutionCoordinator.ts

Route 1 extracted edit activation/write authority and context read/inspect/repo-explain stages.

Route 2 now handles the next high-impact block:

1. primary mutation runtime
2. low-risk rename / secondary writes
3. cross-file repair execution
4. continuation transform evidence used by mutation/repair

This route is high write-safety risk. It must be aggressive, but it must not blur truthfulness, approval, stale-read, or partial repair boundaries.

## Required Reading

Read before editing:

- docs/product-architecture-reset/workflowExecutionCoordinator/README.md
- docs/product-architecture-reset/workflowExecutionCoordinator/00-current-map.md
- docs/product-architecture-reset/workflowExecutionCoordinator/01-ownership-audit.md
- docs/product-architecture-reset/workflowExecutionCoordinator/02-stay-vs-move.md
- docs/product-architecture-reset/workflowExecutionCoordinator/03-extraction-targets.md
- docs/product-architecture-reset/workflowExecutionCoordinator/04-risk-register.md
- docs/product-architecture-reset/workflowExecutionCoordinator/05-validation-plan.md
- docs/product-architecture-reset/workflowExecutionCoordinator/06-next-implementation-routes.md
- current workflowExecutionCoordinator.ts
- current runMvpIntegratedFlow.test.ts
- current edit, repair, policy, evidence, result modules
- Route 1 changes and tests

Use current code as truth.

## Core Rule

Destination by ownership.

Do not create generic buckets:

- helper
- helpers
- utils
- misc
- common
- support
- mvp
- turn/stages as dumping bucket

Use real owners:

- edit/
- repair/
- policy/
- evidence/
- result/
- shared/
- runtime/ only for thin coordination

Runtime may sequence a mutation/repair stage. Runtime must not own mutation instruction planning, write authority, stale-read policy, secondary write expansion, cross-file repair strategy, degradation rules, or partial repair truth.

## Goal

Move visible mutation and repair code out of workflowExecutionCoordinator.ts.

This route must complete both categories unless safety blocks:

A. Mutation runtime and secondary-write extraction.
B. Cross-file repair execution extraction.

If A cannot complete safely, stop before B and report PARTIAL.

If A completes but B cannot complete safely, report PARTIAL with A committed if green.

## Checkpoint A: Mutation Runtime Extraction

Move primary mutation, mutation failure projection, low-risk rename, secondary writes, and stale-read/write-adjacent runtime ownership into edit-owned modules.

Likely destinations, subject to inspection:

- packages/ts-shell/src/edit/mutationRuntimeStage.ts
- packages/ts-shell/src/edit/lowRiskRenameStage.ts
- packages/ts-shell/src/edit/secondaryWriteStage.ts
- packages/ts-shell/src/edit/mutationInstructionPlanner.ts
- packages/ts-shell/src/edit/mutationTargetSelection.ts
- packages/ts-shell/src/policy/mutationAuthorityGate.ts if a policy seam is truly needed

Must preserve:

- explicit write approval
- no prompt-text write authority
- no production write default
- denied/aborted/stopped semantics
- stale-read guard before write
- exact patch failure codes
- protected file handling
- changed/failed/patch/provenance aggregation
- partial and failed write truthfulness

Runtime should call edit-owned stage(s), not assemble mutation authority or mutation result truth itself.

## Checkpoint B: Cross-File Repair Extraction

Move cross-file repair execution, degradation decisions, remaining/failed/skipped repair facts, and transform-evidence parsing into repair/evidence-owned modules.

Likely destinations, subject to inspection:

- packages/ts-shell/src/repair/crossFileRepairStage.ts
- packages/ts-shell/src/repair/crossFileRepairPlanning.ts
- packages/ts-shell/src/repair/continuationRepairStage.ts
- packages/ts-shell/src/repair/continuationTransformEvidence.ts
- packages/ts-shell/src/evidence/continuationTransformEvidence.ts if parsing is report-safe evidence rather than executable repair input

Must preserve:

- repair proposal is not repair success
- repair apply without re-verification is not success
- continuation does not create success
- original failure evidence remains visible
- cross-file remaining/failed/skipped/degraded evidence is preserved
- stale blocker evidence is not re-consumed as executable proof
- no-progress repair remains partial/stopped, not success

Runtime should receive repair receipts and pass them to result/evidence modules; it should not decide repair truth.

## Ownership Audit Before Edits

Before editing, produce an in-thread table:

- region/symbol
- current responsibility
- owner domain
- target file
- why not runtime
- compatibility strategy
- tests
- stop risk

No edits before this table exists.

## Strict Non-Goals

Do not move verification/result handoff in this route.

Do not move read/context stages.

Do not split SessionManager or CLI.

Do not change product behavior.

Do not run live provider.

Do not change provider defaults.

Do not change production write defaults.

Do not infer write authority from prompt text.

Do not weaken evidence/verdict truthfulness.

Do not turn stopped/blocked/partial/skipped/not-run/no-provider/not-proven into success.

Do not move route docs/reports/package scripts.

Do not mass-format unrelated files.

## Compatibility

Keep old public runtime behavior and old runMvp wrapper behavior.

workflowExecutionCoordinator.ts may remain the caller-facing coordinator, but it must delegate moved mutation/repair responsibilities to owner modules.

Avoid import cycles between runtime, edit, repair, evidence, and result owners.

## Validation

Required after Checkpoint A:

- targeted runMvp mutation/edit/stale-read/patch-failure cases if available
- npm test -w packages/ts-shell -- src/edit/mutationInstructionPlanner.test.ts src/edit/mutationTargetSelection.test.ts
- focused tests for new edit mutation runtime modules
- npm test -w packages/ts-shell -- src/orchestration/fencedEditRuntimeActivation.test.ts if fenced/write flow is touched
- npm run build -w packages/ts-shell
- git diff --check

Required after Checkpoint B and final:

- npm test -w packages/ts-shell -- src/orchestration/runMvpIntegratedFlow.test.ts
- npm test -w packages/ts-shell -- src/runtime/workflowExecutionCoordinator.test.ts
- focused repair tests:
  - crossFileRepairPlanning
  - groundedAnswerRepair
  - new crossFileRepairStage / continuationTransformEvidence tests
- stopped session continuity tests if continuation/repair evidence moves
- npm run verify:result-contract
- npm run verify:route221-anti-false-success-gate
- npm run build -w packages/ts-shell
- product/runtime import scan for docs/scripts/dev-history leakage
- git diff --check
- git status --short --branch

Do not run live provider.

## Completion Criteria

COMPLETE requires:

- ownership table completed before edits
- mutation runtime / secondary-write ownership extracted
- cross-file repair execution ownership extracted
- workflowExecutionCoordinator.ts visibly smaller and delegates both responsibilities
- no generic helper/turn bucket movement
- full runMvp suite passes
- result contract and Route221 gate pass
- no write authority, stale-read, partial repair, or truthfulness drift
- remaining workflowExecutionCoordinator responsibilities listed

PARTIAL if:

- only mutation extraction completes
- cross-file repair extraction fails or is unsafe
- full runMvp suite fails
- behavior compatibility is uncertain

BLOCKED if:

- safe extraction requires verification/result handoff first
- import cycles cannot be avoided
- truthfulness, write authority, or repair semantics would weaken

## Serena Policy

Use Serena if available for symbol overview, references, call graph, and ownership clustering.

Do not use Serena as validation replacement.

If onboarding asks for memory writes and memory updates are not needed, skip onboarding and continue.

## Commit

Commit green checkpoints if useful.

Suggested prefix:

phase3-coordinator-route2:

Do not push.

## Final Report

Include:

1. Final status
2. Ownership audit summary
3. Mutation files moved/created
4. Repair files moved/created
5. Compatibility strategy
6. Product behavior changed yes/no
7. Truthfulness impact
8. Validation results
9. Serena usage
10. Remaining coordinator responsibilities
11. Commit hash if committed
12. Whether safe to start next route
