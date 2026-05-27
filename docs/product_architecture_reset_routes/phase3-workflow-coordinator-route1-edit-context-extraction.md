# Phase 3 workflowExecutionCoordinator Route 1: Edit Activation And Context Read Extraction

## Purpose

Start reducing:

packages/ts-shell/src/runtime/workflowExecutionCoordinator.ts

The audit classified this file as a valid runtime shell plus a partial new monolith. This route removes two compatible early execution areas:

1. Edit activation and write authority surface.
2. Context read, inspect-files, and repo-explain runtime surface.

This is implementation work, not another audit.

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
- current edit/context/policy/result modules

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
- context/
- policy/
- result/
- evidence/
- runtime/ only for thin coordination

Runtime may sequence domain stages. Runtime must not own write authority policy, edit route activation, read delivery semantics, repo diagnosis metadata, or terminal truth projection.

## Goal

Move visible code out of workflowExecutionCoordinator.ts.

This route must complete both checkpoints unless safety blocks:

A. Edit activation and write authority extraction.
B. Context read / inspect / repo-explain extraction.

If A cannot complete safely, stop before B and report PARTIAL.

If A completes but B cannot complete safely, report PARTIAL with A committed if green.

## Checkpoint A: Edit Activation And Write Authority

Move discovery edit, target-set edit, fenced replacement activation, workspace authority construction, and edit-route result assembly into edit-owned runtime stages.

Likely destinations, subject to inspection:

- packages/ts-shell/src/edit/discoveryEditRuntimeStage.ts
- packages/ts-shell/src/edit/fencedEditRuntimeStage.ts
- packages/ts-shell/src/policy/ or existing edit/workspace authority owner only if authority logic is truly policy-owned

Must preserve:

- explicit write approval
- default no-write behavior
- denied/aborted/stopped semantics
- fenced replacement stream parity
- target-set edit behavior
- stale-read boundaries
- user-facing result shape

Runtime should call edit-owned stage(s), not build edit activation itself.

## Checkpoint B: Context Read / Inspect / Repo Explain

Move read-file, inspect-files, repo-explain, and context-planning read delivery branches into context-owned runtime stages.

Likely destinations, subject to inspection:

- packages/ts-shell/src/context/readRuntimeStage.ts
- packages/ts-shell/src/context/inspectFilesStage.ts
- packages/ts-shell/src/context/repoExplainRuntimeStage.ts
- existing context/readDeliveryProjection.ts
- existing context/repoExplainStage.ts

Must preserve:

- read-only changedFiles=[]
- no write/bash approval for read-only tasks
- no provider config consumption on no-write inspect
- missing/ambiguous target remains stopped/blocking, not success
- repo diagnosis keeps current caveats
- read delivery remains grounded and report-safe
- verification stays not-requested/not-run where current behavior says so

Runtime should call context-owned stage(s), not own read delivery or repo explain semantics.

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

Do not move mutation runtime or cross-file repair.

Do not move verification/result truth handoff.

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

workflowExecutionCoordinator.ts may remain the caller-facing coordinator, but it must delegate moved responsibilities to owner modules.

Avoid import cycles between runtime and edit/context owners.

## Validation

Required after Checkpoint A:

- npm test -w packages/ts-shell -- src/orchestration/fencedEditRuntimeActivation.test.ts
- targeted runMvp edit activation / discovery / fenced / target-set cases if available
- focused tests for new edit stage modules
- npm run build -w packages/ts-shell
- git diff --check

Required after Checkpoint B and final:

- npm test -w packages/ts-shell -- src/orchestration/runMvpIntegratedFlow.test.ts
- npm test -w packages/ts-shell -- src/runtime/workflowExecutionCoordinator.test.ts
- focused context tests:
  - readDeliveryProjection
  - readWindowContinuation
  - repoExplainStage
  - new context runtime stage tests
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
- edit activation/write authority stage extracted
- context read/inspect/repo-explain stage extracted
- workflowExecutionCoordinator.ts visibly smaller and delegates both responsibilities
- no generic helper/turn bucket movement
- full runMvp suite passes
- result contract and Route221 gate pass
- no write/read truthfulness drift
- remaining workflowExecutionCoordinator responsibilities listed

PARTIAL if:

- only checkpoint A completes
- checkpoint B fails or is unsafe
- full runMvp suite fails
- behavior compatibility is uncertain

BLOCKED if:

- safe extraction requires mutation/repair/verification/result extraction first
- import cycles cannot be avoided
- truthfulness or write authority would weaken

## Serena Policy

Use Serena if available for symbol overview, references, call graph, and ownership clustering.

Do not use Serena as validation replacement.

If onboarding asks for memory writes and memory updates are not needed, skip onboarding and continue.

## Commit

Commit green checkpoints if useful.

Suggested prefix:

phase3-coordinator-route1:

Do not push.

## Final Report

Include:

1. Final status
2. Ownership audit summary
3. Edit activation files moved/created
4. Context read files moved/created
5. Compatibility strategy
6. Product behavior changed yes/no
7. Truthfulness impact
8. Validation results
9. Serena usage
10. Remaining coordinator responsibilities
11. Commit hash if committed
12. Whether safe to start next route
