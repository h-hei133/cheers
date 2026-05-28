# Phase 3 workflowTaskPlan Route 1: Intent, Target, And Session Fact Split

## Purpose

Start reducing:

packages/ts-shell/src/planning/workflowTaskPlan.ts

The audit classified this file as a valid planning facade plus a partial planning monolith. This route combines the two lowest-risk adjacent cleanup routes:

1. Intent and target planning split.
2. Inline continuity and session fact adapter extraction.

This is implementation work, not another audit.

The goal is to keep `buildWorkflowTaskPlan` as the stable compatibility facade while moving real planning sub-responsibilities into named owner modules.

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
- current planning, session, policy, context, edit, repair, verification modules

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

Planning must not become a new dumping bucket. New files must be named by product responsibility.

Allowed destinations:

- planning/
- session/
- policy/
- context/
- edit/
- verification/
- repair/
- evidence/
- shared/

This route should normally use:

- planning/workflowIntentSignals.ts
- planning/workflowTargetPlanning.ts
- session/inlineContinuityContext.ts
- session/turnContinuationFacts.ts
- session/continuationTargetRebase.ts

If files already exist, integrate into them instead of duplicating.

## Goal

Move visible code out of workflowTaskPlan.ts while preserving the facade:

- `buildWorkflowTaskPlan` remains the stable public planning facade.
- `extractInlineContinuityContext` remains compatible through re-export or adapter until runtime imports the session owner directly.
- Plan output shape remains unchanged.

This route must complete both checkpoints unless safety blocks:

A. Intent and target planning split.
B. Inline continuity and session fact adapter extraction.

If A cannot complete safely, stop before B and report PARTIAL.

If A completes but B cannot complete safely, report PARTIAL with A committed if green.

## Checkpoint A: Intent And Target Planning Split

Move pure prompt intent and target planning facts out of workflowTaskPlan.ts.

Candidates, subject to ownership audit:

- WorkflowTaskIntentSignals
- extractWorkflowTaskIntentSignals
- removeNegatedMutationInstructions
- shouldBlockMutationForTargetResolution
- initial target resolution integration
- verify-tail fallback target handling
- explicit path reference setup
- prompt predicates that are generic planning intent, not repair/verify/context-specific

Likely destinations:

- packages/ts-shell/src/planning/workflowIntentSignals.ts
- packages/ts-shell/src/planning/workflowTargetPlanning.ts
- existing packages/ts-shell/src/planning/promptTargetProjection.ts

Must preserve:

- taskKind
- blockedReason
- targetMissing
- verifyAfterEdit
- usedRestoredState
- targetPath
- command blocker behavior
- ambiguous target blocker wording
- conservative chat fallback
- read/edit/command intent classification

Do not move session, repair, verification, or command allowlist authority in this checkpoint.

## Checkpoint B: Inline Continuity And Session Fact Adapter

Move raw inline continuity block parsing and session-like fact normalization out of planning.

Candidates, subject to ownership audit:

- extractInlineContinuityContext
- cleanPrompt stripping
- read window and fragment inline fields
- verification inline fields
- approval and permission request fields
- request-scope fields
- repair status and continuation status fields
- action-result seed and last-task signal derivation, if safe
- rebindContinuationTargetToWorkspace
- isUsableContinuationTargetPath

Likely destinations:

- packages/ts-shell/src/session/inlineContinuityContext.ts
- packages/ts-shell/src/session/turnContinuationFacts.ts
- packages/ts-shell/src/session/continuationTargetRebase.ts

Must preserve:

- cleanPrompt output
- ContinuityStateLike field names
- numeric guards
- boolean guards
- read fragment/window fields
- verification fields
- approval/permission facts as facts only
- no authority granted from parsed approval or permission facts
- no session persistence format change

Do not edit SessionManager.ts.

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

Do not move context/read planning in this route.

Do not move edit/repair planning in this route.

Do not move verification/command planning in this route.

Do not move browser intent planning in this route.

Do not change command allowlist policy.

Do not change write/edit contract.

Do not change product behavior.

Do not run live provider.

Do not change provider defaults.

Do not change production write defaults.

Do not infer write authority from prompt text or continuity facts.

Do not weaken evidence/verdict truthfulness.

Do not turn stopped/blocked/partial/skipped/not-run/no-provider/not-proven into success.

Do not move route docs/reports/package scripts.

Do not mass-format unrelated files.

## Compatibility

Keep current public imports working:

- buildWorkflowTaskPlan from planning/workflowTaskPlan.ts
- extractInlineContinuityContext from planning/workflowTaskPlan.ts until runtime migrates
- WorkflowTaskPlan contract from orchestration/workflowTaskPlanner.ts

The facade may delegate, but must keep the current return shape and branch ordering unless explicitly proven behavior-equivalent.

## Validation

Required after Checkpoint A:

- npm test -w packages/ts-shell -- src/planning/workflowTaskPlan.test.ts src/planning/promptTargetProjection.test.ts
- focused tests for new workflowIntentSignals/workflowTargetPlanning modules
- targeted runMvp read/edit/command intent cases if available
- npm run build -w packages/ts-shell
- git diff --check

Required after Checkpoint B and final:

- npm test -w packages/ts-shell -- src/planning/workflowTaskPlan.test.ts
- focused tests for new session inline continuity modules
- npm test -w packages/ts-shell -- src/session/stoppedSessionContinuity.test.ts src/session/sessionResumeContextBuilder.test.ts src/session/continuationEvidenceParity.test.ts
- full npm test -w packages/ts-shell -- src/orchestration/runMvpIntegratedFlow.test.ts if plan outputs or branch order changed broadly
- npm run build -w packages/ts-shell
- product/runtime import scan for docs/scripts/dev-history leakage
- git diff --check
- git status --short --branch

Run verify:result-contract and verify:route221-anti-false-success-gate if any route touches result/evidence truth, terminal classification, or not-proven/partial/blocked semantics.

Do not run live provider.

## Completion Criteria

COMPLETE requires:

- ownership table completed before edits
- intent and target planning split extracted
- inline continuity/session fact adapter extracted
- workflowTaskPlan.ts visibly smaller and delegates both responsibilities
- no generic helper/planning-utils bucket movement
- buildWorkflowTaskPlan output compatibility preserved
- extractInlineContinuityContext compatibility preserved
- focused tests and build pass
- no truthfulness, authority, target, or continuation drift
- remaining workflowTaskPlan responsibilities listed

PARTIAL if:

- only Checkpoint A completes
- Checkpoint B fails or is unsafe
- tests fail
- behavior compatibility is uncertain

BLOCKED if:

- safe extraction requires context/repair/verification planning first
- import cycles cannot be avoided
- authority or truthfulness boundaries would weaken

## Serena Policy

Use Serena if available for symbol overview, references, call graph, and ownership clustering.

Do not use Serena as validation replacement.

If onboarding asks for memory writes and memory updates are not needed, skip onboarding and continue.

## Commit

Commit green checkpoints if useful.

Suggested prefix:

phase3-taskplan-route1:

Do not push.

## Final Report

Include:

1. Final status
2. Ownership audit summary
3. Intent/target files moved or created
4. Session continuity files moved or created
5. Compatibility strategy
6. Product behavior changed yes/no
7. Truthfulness and authority impact
8. Validation results
9. Serena usage
10. Remaining workflowTaskPlan responsibilities
11. Commit hash if committed
12. Whether safe to start next route
