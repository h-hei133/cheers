# Phase 3 runMvp Route 2: Planning, Target Policy, Context Read, And Repo Explain Extraction

## Purpose

Continue extracting:

packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts

Route 1 moved outer runtime shell and several handoff surfaces into real owner modules.

Route 2 combines planned extraction Phase 3 and Phase 4:

1. Workflow intent, target, and command policy planning.
2. Context read, repo explain, read delivery, and read continuation.

These belong together because they are no-write planning/read responsibilities.

This route must produce visible code movement out of runMvpIntegratedFlow.ts. It must not stop at docs, comments, shims, or generic buckets.

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
- current planning, context, policy, result, session, edit, verification modules
- Route 1 changes and new owner modules

Use current code as truth.

## Core Rule: Destination By Ownership

Do not use turn/stages as a dumping ground.

Do not create vague files:

- helper
- helpers
- utils
- misc
- common
- support
- mvp

Use real owner modules:

- planning/
- context/
- policy/
- session/
- result/
- edit/
- verification/
- shared/

`turn/` is allowed only for thin coordination. The logic in this route should usually belong to planning, context, policy, session, result, edit, or verification.

## Goal

Move no-write planning/read responsibilities out of runMvpIntegratedFlow.ts into owner modules.

Expected owner destinations, subject to inspection:

- planning/workflowIntentSignals.ts
- planning/workflowTaskPlan.ts
- planning/promptTargetProjection.ts
- policy/commandIntentPolicy.ts
- edit/mutationTargetSelection.ts
- context/readDeliveryProjection.ts
- context/readWindowContinuation.ts
- context/repoInspectStage.ts
- context/repoExplainStage.ts
- result/groundedDeliveryProjection.ts
- session/continuationPromptState.ts

If files already exist, integrate into them instead of duplicating.

## Required Scope

This route should move at least:

1. One meaningful intent/target/command-policy planning family.
2. One meaningful context/read/repo-explain delivery family.

Preferred extraction candidates, subject to ownership audit:

- WorkflowTaskIntentSignals
- extractWorkflowTaskIntentSignals
- prompt path/target projection
- command intent / unsupported command policy
- read/write/verify/diagnosis cue classification
- target projection parts that affect read/write selection
- buildReadTaskDelivery
- buildSingleGroundedDelivery
- read window / fragment continuation helpers
- repo explain / inspect delivery helpers
- grounded delivery projection

## Strict Non-Goals

Do not extract edit/write execution.

Do not extract mutation execution.

Do not extract verification execution.

Do not extract repair execution.

Do not deeply split executeWorkflowTaskPlan beyond read/context branches required by this route.

Do not change product behavior.

Do not run live provider.

Do not change provider defaults.

Do not change write/apply authority.

Do not weaken evidence/verdict truthfulness.

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

No edits before this table exists.

### Checkpoint B: Planning/Target/Command Policy Extraction

Move at least one meaningful planning family.

Must preserve:

- read/diagnosis routing behavior
- command allowlist blocker behavior
- multi-suffix target handling
- no-write planning runtime behavior
- write-intent classification truthfulness

### Checkpoint C: Context Read / Repo Explain / Delivery Extraction

Move at least one meaningful read/context family.

Must preserve:

- read-only changedFiles=[]
- no provider config consumption on no-write inspect
- grounded read delivery requirements
- repo explain and inspect output shape
- read continuation evidence

### Checkpoint D: Validation And Audit

Run validation and list remaining runMvp responsibilities.

## Compatibility Requirements

Old runMvp public imports must keep working.

If existing tests or modules import symbols from the legacy path, keep compatibility through re-export shims or stable internal exports.

Do not expose regex internals as public cross-domain APIs unless necessary.

## Validation

Required:

- npm test -w packages/ts-shell -- src/orchestration/runMvpIntegratedFlow.test.ts
- focused tests for moved planning/context/policy modules
- read/diagnosis focused tests if available
- command blocker focused tests if available
- target resolution focused tests if available
- no-write real-mode inspect cases if affected
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
- at least one planning/target/command-policy family moved
- at least one context/read/repo-explain/delivery family moved
- extracted code placed in real owner modules, not generic turn buckets
- full runMvp suite passes
- result contract and Route221 gate pass
- no no-write/read-only truthfulness drift
- remaining runMvp responsibilities listed

PARTIAL if:

- only docs/comments change
- only one of Phase 3 or Phase 4 lands
- full runMvp suite fails
- code moves into vague helper or turn bucket files

BLOCKED if:

- safe extraction requires edit/mutation/verification/repair extraction first
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

phase3-runmvp-route2:

Do not push.

## Final Report

Include:

1. Final status
2. Ownership audit summary
3. Planning families moved
4. Context/read families moved
5. Target owner modules
6. Compatibility shims/exports
7. Product behavior changed yes/no
8. Truthfulness impact
9. Validation results
10. Serena usage
11. Remaining runMvp responsibilities
12. Commit hash if committed
13. Whether it is safe to start route 3
