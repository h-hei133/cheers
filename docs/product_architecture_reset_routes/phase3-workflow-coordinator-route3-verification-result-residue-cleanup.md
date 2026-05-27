# Phase 3 workflowExecutionCoordinator Route 3: Verification, Result Handoff, And Continuation Residue Cleanup

## Purpose

Finish reducing:

packages/ts-shell/src/runtime/workflowExecutionCoordinator.ts

Route 1 extracted edit activation and context read stages.
Route 2 extracted mutation runtime and cross-file repair stages.

Route 3 handles the remaining truth-sensitive runtime responsibilities:

1. verification status semantics and command verification retry
2. final evidence/result handoff assembly
3. continuation/helper residue cleanup after behavior-owning stages have moved

This is expected to be the final workflowExecutionCoordinator cleanup route.

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
- current verification, result, evidence, planning, repair, edit, session modules
- Route 1 and Route 2 changes and tests

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

- verification/
- result/
- evidence/
- planning/
- repair/
- session/
- edit/
- policy/
- shared/
- runtime/ only for thin coordination

Runtime may sequence verification/result stages. Runtime must not own verification semantics, evidence truth, terminal verdict rules, stale continuation predicates, or executable transform evidence policy.

## Goal

Move verification/result truth and continuation residue out of workflowExecutionCoordinator.ts.

This route must complete both checkpoints unless safety blocks:

A. Verification and result/evidence handoff extraction.
B. Continuation residue cleanup.

If A cannot complete safely, stop before B and report PARTIAL.

If A completes but B cannot complete safely, report PARTIAL with A committed if green.

## Checkpoint A: Verification And Result/Evidence Handoff

Move low-risk verification, command verification retry, skipped/not-requested projection, repair fallback note, and final result contract assembly into verification/result/evidence-owned modules.

Likely destinations, subject to inspection:

- packages/ts-shell/src/verification/lowRiskVerificationStage.ts
- packages/ts-shell/src/verification/commandVerificationStage.ts
- packages/ts-shell/src/verification/verificationStage.ts if an existing owner is better
- packages/ts-shell/src/result/workflowRuntimeProjection.ts
- packages/ts-shell/src/result/terminalVerdictProjection.ts if needed
- packages/ts-shell/src/evidence/turnEvidenceLedger.ts
- packages/ts-shell/src/evidence/verdictFacade.ts only if stable receipt concepts belong there

Must preserve:

- not-requested, skipped, blocked, failed, partial, not-proven distinctions
- command approval denied is not command success
- changed files without verification remain unverified
- apply without verification is not success when verification is required
- one file passing cannot hide another file failure
- repair proposal/apply does not imply repair success without post-repair verification
- Route221 anti-false-success behavior
- resultSurface output compatibility
- report-safe/redacted projections

Runtime should pass stage receipts to verification/result/evidence owners. It should not assemble terminal truth manually.

## Checkpoint B: Continuation Residue Cleanup

After A is green, prove which local continuation/helper predicates are still live.

Move live residues to owner modules or delete dead residues only with reference/build proof.

Likely destinations, subject to inspection:

- packages/ts-shell/src/planning/workflowTaskPlan.ts
- packages/ts-shell/src/repair/continuationRepairStage.ts
- packages/ts-shell/src/repair/continuationTransformEvidence.ts
- packages/ts-shell/src/evidence/continuationTransformEvidence.ts
- packages/ts-shell/src/session/turnContinuationFacts.ts
- concrete core/path owner only if path normalization is truly shared

Candidates:

- prompt follow-up predicates
- extractKeyTerms if still live
- inferReplaceDirectiveFromContinuity
- parseTransformEvidence if not already fully owned
- collectContinuationTransforms
- shouldBlockMutationForTargetResolution
- normalizePathLike
- any dead local residue proven by references/build

Must preserve:

- continuation prompt routing
- repair follow-up behavior
- migrated-root path rebasing
- stale blocker evidence not becoming executable proof
- stopped/partial continuation not becoming success
- no silent deletion of live behavior

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

Do not move already extracted edit/context/mutation/repair stages unless needed for type imports.

Do not split SessionManager or CLI.

Do not change product behavior.

Do not run live provider.

Do not change provider defaults.

Do not change production write defaults.

Do not weaken evidence/verdict truthfulness.

Do not turn stopped/blocked/partial/skipped/not-run/no-provider/not-proven into success.

Do not move route docs/reports/package scripts.

Do not mass-format unrelated files.

Do not delete helper residue without reference/build proof.

## Compatibility

Keep old public runtime behavior and old runMvp wrapper behavior.

workflowExecutionCoordinator.ts may remain the caller-facing coordinator, but it must delegate moved truth/residue responsibilities to owner modules.

Avoid import cycles between runtime, verification, result, evidence, planning, repair, and session owners.

## Validation

Required after Checkpoint A:

- targeted runMvp verification/content/unchanged/consistency/command retry cases if available
- npm test -w packages/ts-shell -- src/verification/commandStage.test.ts
- focused tests for new verification/result/evidence modules
- npm run verify:result-contract
- npm run verify:route221-anti-false-success-gate
- npm run build -w packages/ts-shell
- git diff --check

Required after Checkpoint B and final:

- npm test -w packages/ts-shell -- src/orchestration/runMvpIntegratedFlow.test.ts
- npm test -w packages/ts-shell -- src/runtime/workflowExecutionCoordinator.test.ts
- planning/continuation focused tests if residue moves
- repair/evidence focused tests if transform evidence moves
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

- ownership table completed before edits
- verification/result handoff extracted
- continuation residue moved or proven dead and deleted safely
- workflowExecutionCoordinator.ts visibly smaller and delegates truth responsibilities
- no generic helper/turn bucket movement
- full runMvp suite passes
- workflowExecutionCoordinator focused tests pass
- result contract and Route221 gate pass
- no truthfulness, verification, redaction, or continuation drift
- remaining workflowExecutionCoordinator responsibilities listed

PARTIAL if:

- only verification/result extraction completes
- residue cleanup is unsafe
- full runMvp suite fails
- behavior compatibility is uncertain

BLOCKED if:

- safe extraction requires terminal taxonomy redesign
- import cycles cannot be avoided
- truthfulness or redaction would weaken

## Serena Policy

Use Serena if available for symbol overview, references, call graph, and ownership clustering.

Do not use Serena as validation replacement.

If onboarding asks for memory writes and memory updates are not needed, skip onboarding and continue.

## Commit

Commit green checkpoints if useful.

Suggested prefix:

phase3-coordinator-route3:

Do not push.

## Final Report

Include:

1. Final status
2. Ownership audit summary
3. Verification/result files moved/created
4. Continuation residue moved/deleted
5. Compatibility strategy
6. Product behavior changed yes/no
7. Truthfulness impact
8. Validation results
9. Serena usage
10. Remaining coordinator responsibilities
11. workflowExecutionCoordinator line count
12. Commit hash if committed
13. Whether workflowExecutionCoordinator cleanup is complete
