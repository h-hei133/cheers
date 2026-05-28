# Phase 3 Closeout: Planning And Runtime Concentration Cleanup

## Purpose

This is the required grouped closeout route before Phase 3 can stop.

The final concentration audit classified Phase 3 as PARTIAL because two files
remain blocker-level replacement monoliths:

- packages/ts-shell/src/planning/workflowTaskPlan.ts
- packages/ts-shell/src/runtime/workflowExecutionCoordinator.ts

This route must clean both together.

This is not a feature route.
This is not a documentation route.
This is not another wrapper-only route.

The goal is to make planning and runtime files real owners/coordinators, not new
dumping grounds created by the runMvp extraction.

## Required Reading

Read before editing:

- docs/product-architecture-reset/finalConcentrationAudit/README.md
- docs/product-architecture-reset/finalConcentrationAudit/00-file-size-and-fanin-map.md
- docs/product-architecture-reset/finalConcentrationAudit/01-new-owner-concentration-audit.md
- docs/product-architecture-reset/finalConcentrationAudit/02-import-boundary-audit.md
- docs/product-architecture-reset/finalConcentrationAudit/03-runtime-dev-history-leakage-audit.md
- docs/product-architecture-reset/finalConcentrationAudit/05-remaining-architecture-debt-register.md
- docs/product-architecture-reset/finalConcentrationAudit/06-final-reset-verdict.md
- docs/product-architecture-reset/finalConcentrationAudit/07-next-implementation-routes.md
- packages/ts-shell/src/planning/workflowTaskPlan.ts
- packages/ts-shell/src/runtime/workflowExecutionCoordinator.ts
- tests for workflowTaskPlan, workflowExecutionCoordinator, runMvp, and touched owner modules

Use current code as truth.

## Core Rule: Destination By Ownership

Do not create vague buckets:

- helper
- helpers
- utils
- misc
- common
- support
- mvp
- stages as dumping ground

Move logic to the owner that should own it long-term:

- planning/
- context/
- session/continuation/
- repair/
- verification/
- browser/
- edit/
- evidence/
- result/
- policy/
- runtime/
- shared/

Runtime may coordinate, but must not own domain logic.
Planning may select task shape, but must not own session continuation, repair
candidate scoring, verification continuation, browser-specific logic, evidence
string parsing, or context carryover internals.

## Required Scope

COMPLETE requires both parts:

1. planning/workflowTaskPlan.ts concentration cleanup.
2. runtime/workflowExecutionCoordinator.ts concentration cleanup.

If either side cannot be safely completed, stop and report PARTIAL.

## Phase A: Ownership Audit Before Edits

Before editing, produce an in-thread table:

- symbol/region
- current responsibility
- real owner domain
- target file
- why not planning/runtime
- compatibility strategy
- tests
- stop risk

No edits before this table exists.

## Phase B: Planning Concentration Closeout

Clean workflowTaskPlan.ts.

Move unrelated domain planning rules out of generic task planning.

Required extraction candidates, subject to audit:

- continuation lineage and restored-state facts -> session/continuation/
- repair replan and cross-file repair candidate rules -> repair/
- verification continuation planning -> verification/
- read-window / fragment / context carryover rules -> context/
- browser-specific plan detection -> browser/ or browser facade
- command policy leftovers -> policy/
- evidence-string parsing or legacy marker interpretation -> evidence/ or result/
- target projection leftovers -> planning/promptTargetProjection.ts or edit/context owners

workflowTaskPlan.ts may keep:

- public task plan handoff
- task-kind selection
- high-level branch selection inputs
- blocked planning reasons
- stable WorkflowTaskPlan contract

It must not keep broad unrelated domain internals.

## Phase C: Runtime Concentration Closeout

Clean workflowExecutionCoordinator.ts.

Move domain execution branches out of the coordinator where safe.

Required extraction candidates, subject to audit:

- mutation execution sequencing -> edit/
- workspace authority wiring -> policy/ or edit/
- verification execution semantics -> verification/
- repair-stage handoff and cross-file execution decisions -> repair/
- read/repo explain delivery decisions -> context/ or result/
- final evidence/result assembly -> evidence/ and result/
- browser execution branch -> browser/
- provider/proposal handoff remnants -> provider/ or proposal/

workflowExecutionCoordinator.ts may keep:

- public runtime entrypoints
- stream/result parity coordination
- environment-to-runner wiring
- delegation to owner stages
- minimal branch orchestration

It must not keep mutation, verification, repair, read projection, or result
truth ownership.

## Phase D: Compatibility And Boundary Cleanup

Preserve public behavior and compatibility:

- legacy runMvp imports still work
- product turn/runtime callers still work
- no product runtime imports docs/scripts/dev-history
- no route-report dependency
- no package script behavior change
- no SessionManager or CLI cleanup unless strictly required by moved code

If compatibility shims are needed, keep them narrow and documented.

## Strict Non-Goals

Do not add features.

Do not run live provider.

Do not change provider defaults.

Do not change production write defaults.

Do not infer write authority from prompt text.

Do not skip stale-read protection.

Do not weaken evidence/verdict truthfulness.

Do not convert stopped, blocked, partial, skipped, not-run, no-provider, or
not-proven into success.

Do not move route docs/reports/package scripts.

Do not split SessionManager or CLI in this route.

Do not mass-format unrelated code.

## Validation

Required:

- npm test -w packages/ts-shell -- src/orchestration/runMvpIntegratedFlow.test.ts
- focused workflowTaskPlan tests
- focused workflowExecutionCoordinator tests
- focused tests for every moved owner module
- npm run verify:result-contract
- npm run verify:route221-anti-false-success-gate
- npm run build -w packages/ts-shell
- product/runtime import scan for docs/scripts/dev-history leakage
- git diff --check
- git status --short --branch

Run if touched:

- edit facade / workspace authority / fenced edit tests
- verification facade / task relevant verification / command plan tests
- repair facade / stopped continuity tests
- browser transaction gate
- result/evidence facade tests
- verify:product:cli-entry if runtime entry output changes

Do not run live provider.

## Completion Criteria

COMPLETE requires:

- ownership audit table completed before edits
- workflowTaskPlan.ts no longer owns unrelated domain planning rules
- workflowExecutionCoordinator.ts no longer owns mutation, verification, repair,
  read projection, or result truth logic beyond coordination
- extracted logic moved to real owner modules
- no generic helper/runtime/planning dumping bucket
- full runMvp suite passes
- focused owner tests pass
- result contract passes
- Route221 anti-false-success gate passes
- build passes
- remaining planning/runtime local responsibilities listed and justified

PARTIAL if:

- only one file is meaningfully cleaned
- any blocker family remains in planning/runtime without justification
- full runMvp suite fails
- behavior compatibility is uncertain
- code merely moves to another broad bucket

BLOCKED if:

- safe cleanup requires feature redesign
- truthfulness or redaction would be weakened
- compatibility exports cannot be preserved

## Serena Policy

Use Serena if available for:

- symbol overview
- find symbol
- find references
- ownership clustering
- impact analysis for moved symbols

Do not use Serena as validation replacement.

If onboarding asks for memory writes and memory updates are not needed, skip and
continue.

## Commit

Commit if green.

Suggested prefix:

phase3-closeout:

Do not push.

## Final Report

Include:

1. Final status
2. Ownership audit summary
3. Planning families moved
4. Runtime families moved
5. Target owner modules
6. Compatibility shims/exports
7. Product behavior changed yes/no
8. Truthfulness impact
9. Validation results
10. Serena usage
11. Remaining planning/runtime debt
12. Commit hash if committed
13. Whether Phase 3 can stop
