# Phase 3: workflowExecutionCoordinator Ownership Audit

## Purpose

Audit:

packages/ts-shell/src/runtime/workflowExecutionCoordinator.ts

This file received the main runtime sequencing after `runMvpIntegratedFlow.ts` became a compatibility wrapper.

The purpose of this route is to determine whether `workflowExecutionCoordinator.ts` is a legitimate runtime coordinator or has become the new monolithic runMvp container.

This is an audit-only route.

Do not move source files.
Do not edit runtime code.
Do not rewrite tests.
Do not change package scripts.
Do not run live provider.

## Output Directory

Write all audit artifacts under:

docs/product-architecture-reset/workflowExecutionCoordinator/

Required outputs:

- docs/product-architecture-reset/workflowExecutionCoordinator/README.md
- docs/product-architecture-reset/workflowExecutionCoordinator/00-current-map.md
- docs/product-architecture-reset/workflowExecutionCoordinator/01-ownership-audit.md
- docs/product-architecture-reset/workflowExecutionCoordinator/02-stay-vs-move.md
- docs/product-architecture-reset/workflowExecutionCoordinator/03-extraction-targets.md
- docs/product-architecture-reset/workflowExecutionCoordinator/04-risk-register.md
- docs/product-architecture-reset/workflowExecutionCoordinator/05-validation-plan.md
- docs/product-architecture-reset/workflowExecutionCoordinator/06-next-implementation-routes.md

## Required Reading

Read before conclusions:

- packages/ts-shell/src/runtime/workflowExecutionCoordinator.ts
- packages/ts-shell/src/runtime/workflowExecutionCoordinator.test.ts if present
- packages/ts-shell/src/orchestration/runMvpIntegratedFlow.ts
- packages/ts-shell/src/orchestration/runMvpIntegratedFlow.test.ts
- docs/product-architecture-reset/runMvp/README.md
- docs/product-architecture-reset/runMvp/00-runmvp-current-map.md
- docs/product-architecture-reset/runMvp/01-runmvp-ownership-zones.md
- docs/product-architecture-reset/runMvp/02-runmvp-extraction-targets.md
- docs/product-architecture-reset/runMvp/03-runmvp-stay-vs-move.md
- docs/product-architecture-reset/runMvp/04-runmvp-extraction-order.md
- docs/product-architecture-reset/runMvp/05-runmvp-validation-plan.md
- docs/product-architecture-reset/runMvp/06-runmvp-risk-register.md
- current owner modules under:
  - runtime/
  - planning/
  - context/
  - provider/
  - proposal/
  - edit/
  - verification/
  - repair/
  - evidence/
  - result/
  - policy/
  - browser/
  - session/
  - shared/

Use current code as truth.

## Core Question

Does `workflowExecutionCoordinator.ts` only coordinate domain modules, or does it still own domain logic?

Runtime coordination may stay.

Domain logic must move.

## Ownership Standard

Runtime coordinator may own:

- turn/request sequencing
- calling domain modules in order
- adapting domain receipts into one execution result
- preserving stream/non-stream parity
- public runtime entrypoint glue
- compatibility with legacy runMvp exports

Runtime coordinator must not own:

- provider prompt/output policy
- planning intent classification
- target selection policy
- command authority policy
- mutation instruction planning
- write authority policy
- verification semantics
- repair strategy
- evidence truth rules
- terminal verdict rules
- read delivery projection
- browser-specific logic
- session persistence or continuation ownership

If those appear in the file, classify them as extraction candidates.

## Required Analysis

For every major symbol, function, type, constant, and large region, record:

- current responsibility
- whether it is coordination or domain logic
- final owner domain
- should stay / move / split / delete later
- proposed destination file
- compatibility needs
- test coverage needed
- extraction risk
- suggested implementation route

Do not leave large regions unmapped.

## Destination Rules

Use real owner modules:

- runtime/
- planning/
- context/
- provider/
- proposal/
- edit/
- verification/
- repair/
- evidence/
- result/
- policy/
- browser/
- session/
- shared/

Do not propose vague destinations:

- helper
- helpers
- utils
- misc
- common
- support
- mvp

Do not use `turn/` as a dumping bucket.

Only propose `turn/` if the code is genuinely turn-level coordination.

## Required Outputs

### README.md

Summarize audit purpose, status, and artifact list.

### 00-current-map.md

Map file size, imports, exports, public entrypoints, major functions, major local types, and high-density regions.

### 01-ownership-audit.md

Classify every major symbol/region as:

- valid runtime coordination
- domain logic in wrong owner
- compatibility glue
- temporary adapter
- extraction candidate
- deprecated/legacy residue

### 02-stay-vs-move.md

A table with:

- symbol/region
- stay?
- move?
- split?
- delete/deprecate later?
- final destination
- reason

### 03-extraction-targets.md

Concrete extraction targets grouped by implementation route.

Each target must include:

- source symbols/regions
- destination file
- compatibility strategy
- tests
- stop conditions

### 04-risk-register.md

Risks such as:

- stream/non-stream drift
- result truthfulness drift
- provider default drift
- write authority drift
- verification status collapse
- repair success false upgrade
- import cycle
- compatibility export breakage

### 05-validation-plan.md

Validation for future implementation routes:

- full runMvpIntegratedFlow.test.ts
- workflowExecutionCoordinator focused tests
- verify:result-contract
- verify:route221-anti-false-success-gate
- build -w packages/ts-shell
- import scan
- domain-specific focused tests

### 06-next-implementation-routes.md

Recommend aggressive but safe route grouping.

Do not split into too many tiny routes.

Group compatible extraction targets together.

## Serena Policy

Use Serena if available for:

- symbol overview
- find symbol
- find references
- caller/callee inspection
- ownership clustering
- import cycle risk review

Do not use Serena as validation replacement.

If onboarding asks for memory writes and this audit does not need memory changes, skip onboarding and continue.

## Validation For This Audit Route

Required:

- all required docs exist
- git diff --check
- git status --short --branch

Optional:

- no build/tests required because runtime code must not change

## Completion Criteria

COMPLETE requires:

- all required docs exist
- the whole file is mapped
- every major symbol/region has ownership classification
- clear answer: coordinator is acceptable / partial new monolith / unacceptable new monolith
- concrete implementation route grouping exists
- validation plan exists
- no runtime behavior changed

PARTIAL if:

- only high-level overview exists
- large regions unmapped
- implementation routes are vague
- final owner destinations are vague

BLOCKED if:

- file cannot be inspected
- symbol structure cannot be recovered enough for audit

## Final Report

Include:

1. Final status
2. Docs created
3. Serena usage
4. File size and major symbols
5. Whether it is a valid coordinator or new monolith
6. What should stay
7. Biggest extraction targets
8. Recommended next implementation route grouping
9. Validation summary
10. Whether safe to start implementation
