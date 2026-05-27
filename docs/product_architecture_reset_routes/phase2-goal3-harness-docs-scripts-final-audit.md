# Phase 2 Goal 3: Harness, Docs, Scripts Cleanup And Final Physical Audit

## Purpose

Finish Phase 2 with visible repository cleanup and an honest final physical architecture audit.

Goal 1 moved compatibility facades into final domain directories and extracted verification-owned orchestration surfaces.

Goal 2 extracted real responsibility families from runMvpIntegratedFlow and SessionManager.

Goal 3 must now address the remaining outer structure:

- test / harness / eval / fixture separation
- route-history and evidence-history cleanup
- script/package surface follow-through
- baseline drift classification
- final physical architecture audit

This is still not a feature route.

## Required Reading

Read:

- docs/product_architecture_reset_routes/GOAL.md
- docs/product_architecture_reset_routes/phase2-goal0-physical-architecture-reset-control.md
- docs/product_architecture_reset_routes/phase2-goal1-domain-layout-orchestration-decomposition.md
- docs/product_architecture_reset_routes/phase2-goal2-turn-session-cli-physical-split.md
- docs/product-architecture-reset/phase2-readiness-note.md
- docs/product-architecture-reset/final-compatibility-audit.md if present
- docs/product-architecture-reset/02-artifact-and-naming-hygiene.md
- docs/product-architecture-reset/07-testing-and-validation-strategy.md
- docs/product-architecture-reset/inventory/README.md
- docs/product-architecture-reset/inventory/scripts-inventory.md
- docs/product-architecture-reset/inventory/package-scripts-inventory.md
- docs/product-architecture-reset/inventory/evidence-artifacts-inventory.md
- docs/product-architecture-reset/inventory/quarantine-candidates.md
- current git status and current package scripts

Use current repo state as truth.

## Goal

Complete the visible outer cleanup for Phase 2 and produce a final physical architecture audit.

Goal 3 must do all of the following:

1. Classify the existing full runMvpIntegratedFlow.test.ts baseline drift.
2. Clean or separate at least one meaningful harness/eval/test artifact family where safe.
3. Continue docs/scripts/route-history cleanup where compatibility is already available.
4. Produce a final physical architecture audit with COMPLETE/PARTIAL/BLOCKED judgments.

## Required Baseline Drift Work

The full runMvpIntegratedFlow.test.ts suite has known pre-existing characterization failures.

Goal 3 must not pretend it is a clean baseline.

Required output:

- list failing cases or failing families if reproduced
- classify each as stale expectation, real regression, deprecated characterization, or unresolved
- prove whether sampled failures are pre-existing when practical
- fix low-risk stale expectations only if clearly in scope
- do not hide unresolved drift

## Cleanup Scope

Allowed:

- move or classify low-risk harness/eval/test support files
- create tests/harness/evidence/eval indexes or directories if useful
- move additional route-history docs/scripts/reports only when compatibility and provenance are preserved
- improve docs/DOC_STATUS and reset audit docs
- add compatibility indexes for old paths
- keep old commands working while adding clearer aliases
- update references caused by safe moves

Strong candidates to inspect, not blind requirements:

- packages/ts-shell/src/core/harness/**
- browserRuntimeMvp*
- browserRuntimeGauntlet*
- browserEvalBenchmark*
- route/frozen evidence fixtures and tests
- docs/agent-routes/route*.md
- docs/implementation-context/route*-report.json
- top-level verify-route wrappers
- scripts/dev-history/routes
- docs/dev-history/routes
- docs/evidence/history

## Non-goals

Do not:

- add features
- run live provider
- change provider defaults
- change product runtime behavior
- weaken evidence/verdict truthfulness
- delete route history without compatibility
- move active Route221 evidence infrastructure without adapter
- break old package aliases
- perform broad runMvpIntegratedFlow, SessionManager, or CLI refactor
- change session schema
- make historical provider reports look like default readiness

## Serena Policy

Use Serena only if helpful for symbol/reference inspection around harness/test/runtime imports.

Do not use Serena as validation replacement.

If onboarding asks for memory writes and this goal does not authorize memory changes, skip onboarding and continue.

## Validation

Run validation proportional to touched areas.

Required:

- git diff --check
- git status --short --branch
- npm run build -w packages/ts-shell if TS moved/changed
- npm run verify:result-contract
- npm run verify:route221-anti-false-success-gate
- npm run verify:product:cli-entry if CLI/session/result surfaces touched
- relevant old and new package aliases if scripts moved or aliases changed
- import scan: product/runtime must not import docs/scripts/dev-history
- focused tests for moved harness/eval/test families

Do not run live provider.

## Completion Criteria

COMPLETE requires:

- baseline drift is classified honestly
- at least one meaningful outer artifact family is cleaned, moved, or re-owned
- route/evidence/history compatibility is preserved
- active evidence infrastructure is not accidentally archived
- package aliases remain compatible if touched
- final physical architecture audit exists
- remaining structural debt is listed honestly
- product behavior and truthfulness are preserved

PARTIAL if:

- only audit docs changed
- baseline drift is not classified
- no meaningful artifact family is cleaned
- compatibility blockers prevent cleanup
- final audit cannot classify the reset confidently

BLOCKED if:

- cleanup requires breaking old aliases or evidence provenance
- active evidence infrastructure cannot be safely distinguished from history
- product/runtime imports would need dev-history/docs/scripts

## Commit

Commit green checkpoints if useful.

Suggested prefix:

phase2-goal3:

Do not push.

## Final Report

Include:

1. Final status
2. Baseline drift classification
3. Harness/test/docs/scripts families cleaned
4. Files moved/created/updated
5. Compatibility preserved
6. Product behavior changed yes/no
7. Evidence/truthfulness impact
8. Serena usage
9. Validation results
10. Remaining physical architecture debt
11. Commit hash if committed
12. Recommendation: return to feature work or continue Phase 2.5
