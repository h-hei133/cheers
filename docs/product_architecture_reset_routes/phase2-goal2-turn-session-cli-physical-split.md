# Phase 2 Goal 2: Turn Kernel And Session/CLI Physical Split

## Purpose

Continue the physical architecture reset after Goal 1.

Goal 1 moved compatibility facades into final domain directories and extracted a first verification-owned orchestration family.

Goal 2 must now attack the main runtime concentration points:

- runMvpIntegratedFlow.ts
- SessionManager.ts
- cli.tsx and CLI/session runtime wiring

This is a behavior-preserving structural route, not a feature route.

## Required Reading

Before editing, read:

- docs/product_architecture_reset_routes/GOAL.md
- docs/product_architecture_reset_routes/phase2-goal0-physical-architecture-reset-control.md
- docs/product_architecture_reset_routes/phase2-goal1-domain-layout-orchestration-decomposition.md
- docs/product-architecture-reset/phase2-readiness-note.md
- docs/product-architecture-reset/final-compatibility-audit.md if present
- docs/product-architecture-reset/03-target-product-architecture.md
- docs/product-architecture-reset/04-module-boundaries-and-dependency-rules.md
- docs/product-architecture-reset/05-product-dataflow-and-lifecycle.md
- docs/product-architecture-reset/07-testing-and-validation-strategy.md
- docs/product-architecture-reset/inventory/product-source-artifact-index.md

Use current code as truth.

## Goal

Make the main runtime path visibly less centralized.

Goal 2 must complete both:

1. Extract at least one meaningful turn stage family from runMvpIntegratedFlow or its immediate runtime path.
2. Extract at least one meaningful responsibility family from SessionManager or CLI entry/runtime wiring.

If either side cannot be safely extracted, final status must be PARTIAL unless there is a strong current-code reason.

## Target Direction

Prefer final domain directories, not src/product.

Possible domain targets, subject to inspection:

- packages/ts-shell/src/turn/
- packages/ts-shell/src/session/
- packages/ts-shell/src/cli/
- packages/ts-shell/src/result/
- packages/ts-shell/src/evidence/

Existing compatibility facades must remain compatible.

## Allowed Work

Allowed:

- create turn stage modules
- move narrow helpers out of runMvpIntegratedFlow when safe
- create or extend session-owned modules for presentation, continuation, summary, store, approval memory, or transcript boundaries
- create or extend cli-owned modules for args, invocation, output, command dispatch, approval bridge, or session command routing
- keep old imports working through shims or re-exports
- add focused tests
- commit green checkpoints

Strong candidates, subject to current-code inspection:

- turn/context stage
- turn/planning stage
- turn/proposal stage
- turn/mutation stage
- turn/verification stage
- turn/repair stage
- turn/result stage
- session continuation or summary helpers
- session presentation facts
- CLI invocation through turn facade
- CLI output/result projection helpers

## Non-goals

Do not:

- add features
- run live provider
- change provider defaults
- change apply/edit/verification/repair semantics
- weaken evidence/verdict truthfulness
- change session schema without written plan
- broadly rewrite runMvpIntegratedFlow
- broadly rewrite SessionManager
- broadly rewrite cli.tsx
- move route docs/reports/scripts
- change package command behavior
- mix pure rename-only moves with behavior changes
- format churn unrelated files

## Required Checkpoints

### Checkpoint 1: Inspection and Plan

Use Serena if available for symbol overview, references, and impact analysis.

Produce a short in-thread plan:

- turn stage family to extract
- session or CLI responsibility family to extract
- compatibility strategy
- focused validations
- risks

### Checkpoint 2: Turn Stage Extraction

Extract at least one real stage/helper family from runMvpIntegratedFlow or immediate turn runtime path.

runMvpIntegratedFlow may remain the compatibility wrapper/coordinator, but must begin delegating meaningful responsibility to turn-owned modules.

### Checkpoint 3: Session or CLI Responsibility Extraction

Extract at least one real responsibility family from SessionManager or CLI runtime wiring.

Examples:

- session presentation facts
- session continuation/summary helpers
- CLI invocation through turn facade
- CLI output/result projection
- CLI session command routing

### Checkpoint 4: Validation and Audit

Validate product behavior preservation and truthfulness.

## Serena Policy

Use Serena when available for:

- symbol overview
- find symbol
- find references
- dependency/impact analysis
- focused symbol reads before moving/extracting code

Do not use Serena as validation replacement.

If onboarding asks for memory writes and the goal does not authorize memory changes, skip onboarding and continue with available symbol tools.

## Validation

Required when relevant:

- focused turn/runtime tests
- focused CLI/session/result tests
- session lifecycle/durability tests if session code touched
- npm run verify:product:cli-entry if CLI/session output touched
- npm run verify:result-contract
- npm run build -w packages/ts-shell
- import scan: product/runtime must not import docs/scripts/dev-history
- git diff --check
- git status --short --branch

Do not run live provider.

## Completion Criteria

COMPLETE requires:

- at least one meaningful turn stage/responsibility extracted
- at least one meaningful SessionManager or CLI responsibility extracted
- old entrypoints remain compatible
- runMvpIntegratedFlow, SessionManager, or cli.tsx become visibly less responsible or more clearly delegated
- CLI/session/result do not create success
- partial/stopped/not-proven truthfulness preserved
- focused tests/build pass
- remaining concentration debt listed honestly

PARTIAL if:

- only comments/docs changed
- only wrappers were added without moving responsibility
- only one side was extracted
- tests expose unresolved behavior risk

BLOCKED if:

- safe extraction requires broad rewrite
- session schema migration is required
- compatibility cannot be preserved
- evidence truthfulness is at risk

## Commit

Commit green checkpoints if useful.

Suggested prefixes:

- phase2-goal2-turn:
- phase2-goal2-session:
- phase2-goal2-cli:

Do not push.

## Final Report

Include:

1. Final status
2. Turn stage extracted
3. Session/CLI responsibility extracted
4. Files moved/created
5. Compatibility shims added
6. Product behavior changed yes/no
7. Evidence/truthfulness impact
8. Serena usage
9. Validation results
10. Remaining runtime/session/CLI debt
11. Commit hash if committed
12. Safe to continue to Phase 2 Goal 3
