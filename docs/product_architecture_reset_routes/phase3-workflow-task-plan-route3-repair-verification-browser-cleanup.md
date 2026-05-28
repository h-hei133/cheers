# Phase 3 workflowTaskPlan Route 3: Repair, Verification, Browser Planning And Residue Cleanup

## Purpose

Finish reducing:

packages/ts-shell/src/planning/workflowTaskPlan.ts

Route 1 extracted intent/target planning and inline continuity/session facts.
Route 2 extracted context/read planning and edit/single-file repair planning.

Route 3 combines the remaining planning-owner cleanup areas:

1. Repair, cross-file, degraded reopen, and repair continuation planning.
2. Verification and command planning.
3. Browser intent planning and proven-dead residue cleanup.

This route should make `workflowTaskPlan.ts` a small compatibility planning facade plus final plan assembly surface.

This is planning-only. It must not execute commands, writes, verification, repair, browser actions, session persistence, or terminal result projection.

## Required Reading

Read before editing:

- docs/product-architecture-reset/workflowTaskPlan/README.md
- docs/product-architecture-reset/workflowTaskPlan/00-current-map.md
- docs/product-architecture-reset/workflowTaskPlan/01-ownership-audit.md
- docs/product-architecture-reset/workflowTaskPlan/02-stay-vs-move.md
- docs/product-architecture-reset/workflowTaskPlan/03-extraction-targets.md
- docs/product-architecture-reset/workflowTaskPlan/04-risk-register.md
- docs/product-architecture-reset/workflowTaskPlan/05-validation-plan.md
- docs/product-architecture-reset/workflowTaskPlan/06-next-implementation-routes.md
- current packages/ts-shell/src/planning/workflowTaskPlan.ts
- current packages/ts-shell/src/planning/workflowTaskPlan.test.ts
- Route 1 and Route 2 changes/tests
- current repair, verification, policy, browser, evidence, planning, session modules

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
- planningUtils
- turn/stages

Planning must not become a dumping bucket. New files must be named by product responsibility.

Allowed owner modules for this route:

- repair/
- verification/
- policy/
- browser/
- evidence/
- planning/
- session/
- shared only for a concrete cross-owner contract, not generic helpers

Expected destinations, subject to code inspection:

- packages/ts-shell/src/repair/crossFileRepairPlanning.ts
- packages/ts-shell/src/repair/degradedReopenPlanning.ts
- packages/ts-shell/src/repair/repairContinuationPlanning.ts
- packages/ts-shell/src/verification/verifyContinuationPlanning.ts
- packages/ts-shell/src/verification/commandIntentPlanning.ts
- packages/ts-shell/src/policy/commandIntentPolicy.ts
- packages/ts-shell/src/browser/browserIntentPlanning.ts
- packages/ts-shell/src/evidence/continuationTransformEvidence.ts

If files already exist, integrate into them instead of duplicating.

## Goal

Move remaining owner-specific planning code out of workflowTaskPlan.ts while keeping:

- buildWorkflowTaskPlan as the stable public facade
- current WorkflowTaskPlan return shape
- current branch ordering unless proven behavior-equivalent
- extractInlineContinuityContext compatibility export

This route must complete all three checkpoints unless safety blocks:

A. Repair/cross-file/degraded reopen planning.
B. Verification/command planning.
C. Browser intent planning and residue cleanup.

If A cannot complete safely, stop before B and report PARTIAL.
If A completes but B cannot complete safely, report PARTIAL with A committed if green.
If A and B complete but C cannot complete safely, report PARTIAL with A/B committed if green.

## Checkpoint A: Repair, Cross-File, And Degraded Reopen Planning

Move repair continuation, cross-file candidate scoring, degraded reopen target selection, and transform-evidence consumption into repair/evidence owners.

Candidates, subject to ownership audit:

- hasCrossFileEvidenceSignalInContinuity
- deriveCrossFileRepairCandidates
- hasCrossFileContinuationContextInContinuity
- extractProcessedCrossFilePathsFromContinuity
- extractCrossFileStateListFromContinuityEvidence
- extractCrossFileFailureEntriesFromContinuity
- hasDegradedContinuationEvidenceInState
- isAtypicalReopenFollowUpPrompt
- isDegradedReopenFollowUpPrompt
- resolveContinuationReopenTarget
- isWeakRepairFollowUpPrompt
- isCrossFileRepairFollowUpPrompt
- isRepairContinuationFollowUpPrompt
- inferReplaceDirectiveFromContinuity
- collectContinuationTransforms

Likely destinations:

- repair/crossFileRepairPlanning.ts
- repair/degradedReopenPlanning.ts
- repair/repairContinuationPlanning.ts
- evidence/continuationTransformEvidence.ts

Must preserve:

- crossFileRepair
- additionalTargetPaths
- crossFileConvergedNoop
- previousRemainingTargets
- previousFailedEntries
- degraded reopen fields
- candidate ordering
- candidate cap
- pruned reason strings
- degraded reason strings
- ambiguity blockers
- stale-transform retirement
- repair plan is not repair success
- degraded/partial/noop repair is not terminal success
- stale blocker evidence is not executable proof

Do not move repair execution in this route.

## Checkpoint B: Verification And Command Planning

Move command intent and verify continuation planning into verification/policy owners.

Candidates, subject to ownership audit:

- detectVerifyCommand / hasExternalVerifyOptOut use
- prefersTestOverBuildInFollowUp
- isVerifyContinuationFollowUpPrompt
- isPostEditReadOnlyVerifyFollowUp
- buildWorkflowVerifyContinuation branch
- command cwd mismatch blocker
- command execution intent branch
- detectCommand
- detectUnsupportedCommandIntent
- isAllowlistedRunCommand
- blockedCommandReason

Likely destinations:

- verification/verifyContinuationPlanning.ts
- verification/commandIntentPlanning.ts
- policy/commandIntentPolicy.ts

Must preserve:

- directCommand
- verifyCommand
- blockedReason
- targetMissing
- command cwd mismatch blocker
- unsupported command distinction
- allowlisted command distinction
- test-over-build preference
- command planning does not imply command execution
- verify intent does not imply verification success
- blocked/not-run/skipped does not become success-like

Do not move command execution, verification execution, result projection, or terminal truth classification.

## Checkpoint C: Browser Intent Planning And Residue Cleanup

Move browser-specific plan detection to browser owner and delete/rehome proven residue.

Candidates, subject to ownership audit:

- browser branch using detectWorkflowBrowserPlan
- hasContinuationStateSignalsInState
- extractKeyTerms
- isMutationInstructionFailure
- uniqueStable
- hashStableId
- normalizePathLike
- over-exported rebindContinuationTargetToWorkspace if no external references remain

Likely destinations:

- browser/browserIntentPlanning.ts
- caller-owned modules for live local helpers
- delete dead functions only after reference and build proof

Must preserve:

- browserPlan
- taskKind
- reason
- usedRestoredState
- browser runtime execution unchanged
- no generic helper bucket
- no deletion without rg + TypeScript build proof

Do not move browser execution in this route.

## Ownership Audit Before Edits

Before editing, produce an in-thread table:

- region/symbol
- current responsibility
- owner domain
- target file
- why not workflowTaskPlan facade
- compatibility strategy
- tests
- stop risk

No edits before this table exists.

## Strict Non-Goals

Do not execute repair.

Do not execute verification.

Do not execute commands.

Do not execute browser actions.

Do not change command allowlist policy.

Do not change write/edit authority.

Do not change product behavior.

Do not run live provider.

Do not change provider defaults.

Do not change production write defaults.

Do not infer write authority from prompt text or continuity facts.

Do not weaken evidence/verdict truthfulness.

Do not turn stopped/blocked/partial/skipped/not-run/no-provider/not-proven into success.

Do not move route docs/reports/package scripts.

Do not edit SessionManager or CLI.

Do not mass-format unrelated files.

Do not delete residue without direct reference proof and build proof.

## Compatibility

Keep current public imports working:

- buildWorkflowTaskPlan from planning/workflowTaskPlan.ts
- extractInlineContinuityContext compatibility export from planning/workflowTaskPlan.ts
- WorkflowTaskPlan contract from orchestration/workflowTaskPlanner.ts

The facade may delegate, but must preserve current return shape and branch ordering unless exact behavior-equivalence is proven.

## Validation

Required after Checkpoint A:

- npm test -w packages/ts-shell -- src/planning/workflowTaskPlan.test.ts
- npm test -w packages/ts-shell -- src/repair/crossFileRepairPlanning.test.ts src/repair/groundedAnswerRepair.test.ts
- focused tests for degradedReopenPlanning and repairContinuationPlanning if added
- npm test -w packages/ts-shell -- src/evidence/continuationTransformEvidence.test.ts if evidence parsing changes
- targeted runMvp continuation/cross-file/degraded repair planning cases if available
- npm run build -w packages/ts-shell
- git diff --check

Required after Checkpoint B:

- npm test -w packages/ts-shell -- src/planning/workflowTaskPlan.test.ts
- npm test -w packages/ts-shell -- src/policy/commandIntentPolicy.test.ts src/verification/commandStage.test.ts src/verification/commandVerificationStage.test.ts src/verification/verificationCommandPlan.test.ts
- focused tests for verifyContinuationPlanning and commandIntentPlanning if added
- targeted runMvp verify/command planning cases if available
- npm run build -w packages/ts-shell
- git diff --check

Required after Checkpoint C and final:

- npm test -w packages/ts-shell -- src/planning/workflowTaskPlan.test.ts
- focused browser planning tests if browser owner is created
- full npm test -w packages/ts-shell -- src/orchestration/runMvpIntegratedFlow.test.ts
- npm run build -w packages/ts-shell
- product/runtime import scan for docs/scripts/dev-history leakage
- git diff --check
- git status --short --branch

Required if touched semantics can affect truth:

- npm run verify:result-contract
- npm run verify:route221-anti-false-success-gate

Do not run live provider.

## Completion Criteria

COMPLETE requires:

- ownership table completed before edits
- repair/cross-file/degraded planning extracted
- verification/command planning extracted
- browser intent planning and dead residue cleanup completed
- workflowTaskPlan.ts visibly smaller and delegates remaining owner-specific responsibilities
- no generic helper/planning-utils bucket movement
- buildWorkflowTaskPlan output compatibility preserved
- no repair/verification/command/browser execution moved
- no truthfulness, authority, target, continuation, or degraded repair drift
- focused tests and build pass
- full runMvp suite passes
- remaining workflowTaskPlan responsibilities listed

PARTIAL if:

- only Checkpoint A or A/B completes
- tests fail
- deletion proof is insufficient
- behavior compatibility is uncertain

BLOCKED if:

- safe extraction requires result/evidence terminal redesign
- import cycles cannot be avoided
- authority or truthfulness boundaries would weaken

## Serena Policy

Use Serena if available for symbol overview, references, call graph, and ownership clustering.

Do not use Serena as validation replacement.

If onboarding asks for memory writes and memory updates are not needed, skip onboarding and continue.

## Commit

Commit green checkpoints if useful.

Suggested prefix:

phase3-taskplan-route3:

Do not push.

## Final Report

Include:

1. Final status
2. Ownership audit summary
3. Repair/cross-file/degraded files moved or created
4. Verification/command files moved or created
5. Browser/residue files moved, created, or deleted
6. Compatibility strategy
7. Product behavior changed yes/no
8. Truthfulness and authority impact
9. Validation results
10. Serena usage
11. Remaining workflowTaskPlan responsibilities and line count
12. Commit hash if committed
13. Whether workflowTaskPlan cleanup is complete
