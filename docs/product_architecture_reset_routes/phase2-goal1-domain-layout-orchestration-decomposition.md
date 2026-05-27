# Phase 2 Goal 1: Domain Layout And Orchestration Decomposition

## Purpose

Start the visible physical architecture reset.

Phase 1 created compatibility facades and cleaned some package/script surfaces. Goal 1 must now move toward real domain ownership.

This goal is not a feature route. It is a behavior-preserving physical structure route.

The main objective is to reduce the old pattern:

- orchestration as capability dumping ground
- src/product as compatibility facade bucket
- route-grown names as product-facing structure

and move toward final domain modules.

## Required Reading

Before editing, read:

- docs/product_architecture_reset_routes/GOAL.md
- docs/product_architecture_reset_routes/phase2-goal0-physical-architecture-reset-control.md
- docs/product-architecture-reset/phase2-readiness-note.md
- docs/product-architecture-reset/03-target-product-architecture.md
- docs/product-architecture-reset/04-module-boundaries-and-dependency-rules.md
- docs/product-architecture-reset/05-product-dataflow-and-lifecycle.md
- docs/product-architecture-reset/06-migration-strategy.md
- docs/product-architecture-reset/07-testing-and-validation-strategy.md
- docs/product-architecture-reset/inventory/product-source-artifact-index.md
- docs/product-architecture-reset/final-compatibility-audit.md if present

Use current code as truth. Route A inventory is a starting snapshot, not guaranteed current filesystem truth after G/H/I.

## Goal

Create a visible final-domain structure for the capability areas that already have Phase 1 compatibility facades.

Expected direction, subject to current code inspection:

- packages/ts-shell/src/evidence/
- packages/ts-shell/src/provider/
- packages/ts-shell/src/proposal/
- packages/ts-shell/src/edit/
- packages/ts-shell/src/verification/
- packages/ts-shell/src/repair/
- packages/ts-shell/src/turn/

Do not blindly create all directories if current code does not justify them. But this goal must produce visible physical migration, not only comments or docs.

## Scope

Allowed:

- Move Phase 1 compatibility facades from src/product/* into final domain directories.
- Add compatibility re-export shims from old src/product/* paths.
- Move a meaningful batch of obvious orchestration capability files into final domain modules.
- Update imports and tests.
- Add README or owner notes only where useful.
- Add import boundary checks if lightweight.
- Commit green checkpoint.

Strong candidates to inspect, not blind requirements:

- product/evidence and claim ledger surfaces -> evidence/
- product/providerProposal and provider/proposal bridge surfaces -> provider/ and proposal/
- controlled edit route surfaces -> edit/
- task relevant verification route surfaces -> verification/
- verification repair iteration surfaces -> repair/
- product/turn facade -> turn/
- capability boundary or truthfulness projection surfaces -> evidence/ or policy/

Codex must decide exact moves after symbol/reference inspection.

## Non-goals

Do not:

- add features
- run live provider
- change provider default behavior
- change apply/edit behavior
- change verification semantics
- change repair semantics
- weaken evidence/verdict truthfulness
- delete compatibility paths
- remove old exports without shims
- rewrite runMvpIntegratedFlow deeply
- split SessionManager or CLI in this goal
- move route docs/reports/scripts in this goal
- change package command behavior
- perform broad formatting churn

## Required Checkpoints

### Checkpoint 1: Domain migration plan

Before moving files, produce a short in-thread plan:

- source families to move
- final domain target
- compatibility shim strategy
- tests to run
- risks

### Checkpoint 2: Compatibility facade migration

Move Phase 1 compatibility facades toward final domain directories where safe.

Old imports from src/product/* must keep working through re-export shims.

### Checkpoint 3: Orchestration capability extraction

Move at least one meaningful batch of capability-owned orchestration files into final domain modules.

If no orchestration file can be safely moved, final status must be PARTIAL unless there is a strong current-code reason.

### Checkpoint 4: Validation and audit

Validate behavior preservation and import boundaries.

## Serena Policy

Use Serena if available for:

- symbol overview
- find symbol
- find references
- dependency/impact analysis
- focused symbol reads before moving files

Do not use Serena as validation replacement.

If onboarding asks for memory writes and this goal does not authorize memory changes, skip onboarding and continue with available symbol tools.

## Validation

Run validation proportional to touched areas.

Required:

- focused tests for moved modules
- npm run build -w packages/ts-shell
- npm run verify:result-contract if evidence/result surfaces touched
- npm run verify:route221-anti-false-success-gate if evidence truthfulness touched
- relevant route-history or product aliases if moved files back legacy commands
- import scan: product/runtime must not import docs/scripts/dev-history
- git diff --check
- git status --short --branch

Do not run live provider.

## Completion Criteria

COMPLETE requires:

- visible final-domain directories exist and are used
- src/product is no longer the main active destination for these moved facades
- old src/product imports remain compatible where they existed
- at least one meaningful orchestration capability family is moved or re-owned into a domain module
- behavior-preserving tests pass
- evidence/verdict truthfulness is preserved
- no route history/package/docs migration is mixed into this goal
- final report identifies remaining orchestration debt

PARTIAL if:

- only docs/comments changed
- only src/product files were moved but no orchestration capability was extracted
- compatibility shims could not be completed
- tests identify unresolved migration risk

BLOCKED if:

- safe moves require broad behavior rewrite
- import compatibility cannot be preserved
- truthfulness or redaction would be weakened

## Commit

If green, commit with prefix:

phase2-goal1:

Do not push.

## Final Report

Include:

1. Final status
2. Files moved
3. New domain directories
4. Compatibility shims added
5. Orchestration families extracted
6. Product behavior changed yes/no
7. Evidence/truthfulness impact
8. Serena usage
9. Validation results
10. Remaining orchestration/product compatibility debt
11. Commit hash if committed
12. Safe to continue to Phase 2 Goal 2
