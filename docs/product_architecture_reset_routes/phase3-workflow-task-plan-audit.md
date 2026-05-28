# Phase 3: workflowTaskPlan Ownership Audit

## Purpose

Audit:

packages/ts-shell/src/planning/workflowTaskPlan.ts

This file received `buildWorkflowTaskPlan` after `runMvpIntegratedFlow.ts` was reduced to a compatibility wrapper.

The goal is to decide whether `workflowTaskPlan.ts` is a legitimate planning owner or the new planning monolith.

This is an audit-only route.

Do not edit runtime code.
Do not move source files.
Do not rewrite tests.
Do not change package scripts.
Do not run live provider.

## Output Directory

Write all audit artifacts under:

docs/product-architecture-reset/workflowTaskPlan/

Required outputs:

- docs/product-architecture-reset/workflowTaskPlan/README.md
- docs/product-architecture-reset/workflowTaskPlan/00-current-map.md
- docs/product-architecture-reset/workflowTaskPlan/01-ownership-audit.md
- docs/product-architecture-reset/workflowTaskPlan/02-stay-vs-move.md
- docs/product-architecture-reset/workflowTaskPlan/03-extraction-targets.md
- docs/product-architecture-reset/workflowTaskPlan/04-risk-register.md
- docs/product-architecture-reset/workflowTaskPlan/05-validation-plan.md
- docs/product-architecture-reset/workflowTaskPlan/06-next-implementation-routes.md

## Required Reading

Read before conclusions:

- packages/ts-shell/src/planning/workflowTaskPlan.ts
- packages/ts-shell/src/planning/workflowTaskPlan.test.ts if present
- packages/ts-shell/src/runtime/workflowExecutionCoordinator.ts
- packages/ts-shell/src/orchestration/runMvpIntegratedFlow.test.ts
- docs/product-architecture-reset/runMvp/README.md
- docs/product-architecture-reset/runMvp/01-runmvp-ownership-zones.md
- docs/product-architecture-reset/runMvp/02-runmvp-extraction-targets.md
- docs/product-architecture-reset/runMvp/03-runmvp-stay-vs-move.md
- docs/product-architecture-reset/workflowExecutionCoordinator/README.md
- docs/product-architecture-reset/workflowExecutionCoordinator/01-ownership-audit.md
- docs/product-architecture-reset/workflowExecutionCoordinator/02-stay-vs-move.md
- docs/product-architecture-reset/workflowExecutionCoordinator/06-next-implementation-routes.md
- current planning, context, policy, verification, repair, edit, browser, session, result, evidence, shared modules

Use current code as truth. Older docs are context only.

## Core Question

Does `workflowTaskPlan.ts` only own planning, or does it still own other domains?

Planning may own:

- workflow task shape
- high-level intent classification
- task kind selection
- target planning handoff
- command/read/write/verify/browser intent routing as planning facts
- continuation planning facts
- blocked planning reasons
- branch selection inputs for runtime

Planning must not own:

- command authority execution
- write authority or workspace permission
- mutation instruction generation beyond planning facts
- edit execution semantics
- verification execution semantics
- repair execution strategy
- evidence truth projection
- terminal verdict rules
- session persistence
- browser execution
- context delivery output

If those appear in the file, classify them as extraction candidates.

## Ownership Standard

A planning owner is acceptable if it produces explicit plan facts and does not execute or project final truth.

It is not acceptable if it:

- decides terminal success/failure
- performs write or verification behavior
- mutates workspace state
- owns repair execution
- owns evidence truth
- owns result projection
- embeds unrelated domain algorithms that should live in context/edit/verification/repair/policy/session/browser/result/evidence

## Required Analysis

For every major symbol, type, constant, function, local predicate, and large region, record:

- current responsibility
- whether it is valid planning, domain logic in wrong owner, compatibility glue, temporary adapter, extraction candidate, or deprecated residue
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

- planning/
- policy/
- context/
- edit/
- verification/
- repair/
- browser/
- session/
- evidence/
- result/
- shared/
- core/paths only for concrete path ownership

Do not propose vague destinations:

- helper
- helpers
- utils
- misc
- common
- support
- mvp
- turn/stages as dumping bucket

`planning/` itself must not become a dumping bucket. If a sub-file is proposed, name it by product responsibility.

Bad:

- planning/helpers.ts
- planning/workflowTaskPlanUtils.ts
- planning/misc.ts

Better:

- planning/workflowIntentClassification.ts
- planning/workflowTargetPlanning.ts
- planning/workflowContinuationPlanning.ts
- planning/workflowTaskKindSelection.ts
- policy/commandIntentPolicy.ts
- context/readIntentPlanning.ts
- verification/verifyIntentPlanning.ts
- repair/repairIntentPlanning.ts
- browser/browserIntentPlanning.ts

## Required Outputs

### README.md

Summarize purpose, status, artifact list, and final verdict.

### 00-current-map.md

Map file size, imports, exports, major public types, major functions, local predicates, high-density regions, and consumers.

### 01-ownership-audit.md

Classify every major symbol/region as:

- valid planning ownership
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

- planning facts becoming terminal truth
- command intent becoming command authority
- write intent implying write authority
- verify intent implying verification success
- repair intent implying repair success
- continuation prompt upgrading stopped/partial results
- target resolution drift
- prompt regex overreach
- import cycles
- dead predicate deletion risk

### 05-validation-plan.md

Validation for future implementation routes:

- full runMvpIntegratedFlow.test.ts
- workflowTaskPlan focused tests
- workflowExecutionCoordinator tests
- planning/policy/context/edit/verification/repair focused tests as touched
- verify:result-contract
- verify:route221-anti-false-success-gate
- build -w packages/ts-shell
- import scan

### 06-next-implementation-routes.md

Recommend grouped implementation routes.

Do not split into many tiny routes.

Group compatible extraction targets together.

Include a clear answer:

- safe to continue implementation
- or skip this file and move to SessionManager
- or partial cleanup needed first

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
- clear answer: valid planning owner / partial planning monolith / unacceptable new monolith
- concrete implementation route grouping exists if cleanup is needed
- validation plan exists
- no runtime behavior changed

PARTIAL if:

- only high-level overview exists
- large regions are unmapped
- destinations are vague
- implementation routes are vague

BLOCKED if:

- file cannot be inspected
- symbol structure cannot be recovered enough for audit

## Final Report

Include:

1. Final status
2. Docs created
3. Serena usage
4. File size and major symbols
5. Whether this file is valid planning owner or planning monolith
6. What should stay
7. Biggest extraction targets
8. Recommended grouped implementation routes
9. Validation summary
10. Whether safe to start implementation or move to next file
