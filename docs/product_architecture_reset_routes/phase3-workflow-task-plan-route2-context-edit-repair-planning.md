# Phase 3 workflowTaskPlan Route 2: Context Read And Edit Repair Planning Split

## Purpose

Continue reducing:

packages/ts-shell/src/planning/workflowTaskPlan.ts

Route 1 extracted intent/target planning and inline continuity/session facts.

Route 2 combines the next compatible planning areas:

1. Context, grounded read, summarize, explain, read-window, and read-fragment planning.
2. Edit intent, mutation scope, and single-file repair planning.

This route keeps `buildWorkflowTaskPlan` as the stable facade while moving owner-specific planning into named modules.

This route is planning-only. It must not execute writes, verification, repair, browser actions, session persistence, or result projection.

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
- Route 1 changes and tests
- current context, edit, repair, planning, session, evidence modules

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

- context/
- edit/
- repair/
- planning/
- evidence/ only for existing evidence parsers when needed
- shared/ only for a concrete cross-owner contract, not generic helpers

Expected destinations, subject to code inspection:

- packages/ts-shell/src/context/readIntentPlanning.ts
- packages/ts-shell/src/context/readContinuationPlanning.ts
- packages/ts-shell/src/context/readTargetPlanning.ts
- packages/ts-shell/src/context/contextPlanningIntent.ts
- packages/ts-shell/src/edit/mutationIntentPlanning.ts
- packages/ts-shell/src/edit/mutationScopePlanning.ts
- packages/ts-shell/src/repair/singleFileRepairPlanning.ts

If files already exist, integrate into them instead of duplicating.

## Goal

Move visible owner-specific planning code out of workflowTaskPlan.ts.

This route must complete both checkpoints unless safety blocks:

A. Context and grounded read planning extraction.
B. Edit intent, mutation scope, and single-file repair planning extraction.

If A cannot complete safely, stop before B and report PARTIAL.

If A completes but B cannot complete safely, report PARTIAL with A committed if green.

## Checkpoint A: Context And Grounded Read Planning

Move read, summarize, explain, context packet, read window, and read fragment planning into context-owned modules.

Candidates, subject to ownership audit:

- shouldBuildContextPlanningSurface
- read continuity recovery use
- read window and fragment directive mapping in buildWorkflowTaskPlan
- pathless read blocked branch
- grounded missing/out-of-workspace read target branches
- explicit read branch
- path-only read branch
- summarize/explain branch
- local explain fragment branch
- grounded answer repair read branches when they produce read-only context plan facts

Likely destinations:

- context/readIntentPlanning.ts
- context/readContinuationPlanning.ts
- context/readTargetPlanning.ts
- context/contextPlanningIntent.ts

Must preserve:

- read-only changedFiles behavior downstream
- read-only plan facts, not read delivery output
- readLineCount and readLineOffset
- read fragment index/range/source/fingerprint/filter fields
- contextPlanningRequested
- contextPlanningReason
- pathless read blockers
- out-of-workspace blockers
- grounded answer read-only behavior
- conservative fallback behavior
- no read-only branch implying edit/write/verification success

Do not move repo-explain execution or context delivery output in this route.

## Checkpoint B: Edit Intent, Mutation Scope, And Single-File Repair Planning

Move mutation-specific plan facts and single-file repair planning out of the general facade.

Candidates, subject to ownership audit:

- mutation target selection in buildWorkflowTaskPlan
- classifyEditExpectationContract branch handling
- missing edit target branch
- out-of-workspace target branch
- transform unclear branch
- unsupported discovery edit branch
- mutation scope fields derived from read fragment evidence
- resolveSingleFileEditFailureRepairContext
- resolveSingleFileEditFailureRepairContextAbandonment
- extractSingleFileEditFailureReason
- resolveSingleFileEditRepairPayloadKind

Likely destinations:

- edit/mutationIntentPlanning.ts
- edit/mutationScopePlanning.ts
- repair/singleFileRepairPlanning.ts

Must preserve:

- no prompt-text write authority
- no production write default
- plan facts only, no mutation execution
- missing target stays blocked
- out-of-workspace stays blocked
- unclear transform stays blocked/context-requested
- unsupported discovery edit stays blocked/unsupported
- repairContextUsed
- repairedFailureReason
- repairedTargetFile
- repairPayloadKind
- repairContextAbandoned fields
- local mutation scope required behavior
- repair plan is not repair success

Do not move workspace authority, mutation execution, or repair execution in this route.

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

Do not move repair/cross-file/degraded reopen planning in this route.

Do not move verification/command planning in this route.

Do not move browser intent planning in this route.

Do not change command allowlist policy.

Do not change write/edit authority.

Do not change product behavior.

Do not run live provider.

Do not change provider defaults.

Do not change production write defaults.

Do not infer write authority from prompt text, read fragments, or continuity facts.

Do not weaken evidence/verdict truthfulness.

Do not turn stopped/blocked/partial/skipped/not-run/no-provider/not-proven into success.

Do not move route docs/reports/package scripts.

Do not edit SessionManager or CLI.

Do not mass-format unrelated files.

## Compatibility

Keep current public imports working:

- buildWorkflowTaskPlan from planning/workflowTaskPlan.ts
- extractInlineContinuityContext compatibility export from planning/workflowTaskPlan.ts
- WorkflowTaskPlan contract from orchestration/workflowTaskPlanner.ts

The facade may delegate, but must preserve current return shape and branch ordering unless an exact behavior-equivalent move is proven.

## Validation

Required after Checkpoint A:

- npm test -w packages/ts-shell -- src/planning/workflowTaskPlan.test.ts
- focused tests for new context planning modules
- npm test -w packages/ts-shell -- src/context/readWindowContinuation.test.ts src/context/readRuntimeStage.test.ts src/context/readDeliveryProjection.test.ts
- targeted runMvp read/summarize/explain/context cases if available
- npm run build -w packages/ts-shell
- git diff --check

Required after Checkpoint B and final:

- npm test -w packages/ts-shell -- src/planning/workflowTaskPlan.test.ts
- focused tests for new edit/repair planning modules
- npm test -w packages/ts-shell -- src/edit/mutationInstructionPlanner.test.ts src/edit/mutationTargetSelection.test.ts src/edit/mutationRuntimeStage.test.ts
- npm test -w packages/ts-shell -- src/repair/groundedAnswerRepair.test.ts
- targeted runMvp edit/write/single-file repair planning cases if available
- full npm test -w packages/ts-shell -- src/orchestration/runMvpIntegratedFlow.test.ts if plan outputs or branch order changed broadly
- npm run build -w packages/ts-shell
- product/runtime import scan for docs/scripts/dev-history leakage
- git diff --check
- git status --short --branch

Run npm run verify:result-contract and npm run verify:route221-anti-false-success-gate if any change touches result/evidence truth, terminal classification, degraded/partial semantics, or not-proven/blocked interpretation.

Do not run live provider.

## Completion Criteria

COMPLETE requires:

- ownership table completed before edits
- context/read planning extracted
- edit intent/mutation scope/single-file repair planning extracted
- workflowTaskPlan.ts visibly smaller and delegates both responsibilities
- no generic helper/planning-utils bucket movement
- buildWorkflowTaskPlan output compatibility preserved
- read-only truthfulness preserved
- write authority boundary preserved
- repair planning does not become repair success
- focused tests and build pass
- remaining workflowTaskPlan responsibilities listed

PARTIAL if:

- only Checkpoint A completes
- Checkpoint B fails or is unsafe
- tests fail
- behavior compatibility is uncertain

BLOCKED if:

- safe extraction requires repair/cross-file or verification planning first
- import cycles cannot be avoided
- authority or truthfulness boundaries would weaken

## Serena Policy

Use Serena if available for symbol overview, references, call graph, and ownership clustering.

Do not use Serena as validation replacement.

If onboarding asks for memory writes and memory updates are not needed, skip onboarding and continue.

## Commit

Commit green checkpoints if useful.

Suggested prefix:

phase3-taskplan-route2:

Do not push.

## Final Report

Include:

1. Final status
2. Ownership audit summary
3. Context planning files moved or created
4. Edit/repair planning files moved or created
5. Compatibility strategy
6. Product behavior changed yes/no
7. Truthfulness and authority impact
8. Validation results
9. Serena usage
10. Remaining workflowTaskPlan responsibilities
11. Commit hash if committed
12. Whether safe to start next route
