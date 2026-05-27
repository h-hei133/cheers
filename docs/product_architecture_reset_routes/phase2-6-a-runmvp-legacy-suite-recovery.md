# Phase 2.6-A: runMvpIntegratedFlow Legacy Suite Recovery

## Purpose

Recover `packages/ts-shell/src/orchestration/runMvpIntegratedFlow.test.ts` from classified legacy drift into a trustworthy green suite.

Phase 2.5-A reproduced:

- 167 tests
- 133 passed
- 34 failed

and produced:

- docs/product-architecture-reset/runmvp-baseline-drift-register.md

That was classification only. Phase 2.6-A must resolve the failures.

This is not a feature sprint. It is a baseline recovery and contract cleanup route.

## Required Reading

Read before editing:

- docs/product-architecture-reset/runmvp-baseline-drift-register.md
- docs/product_architecture_reset_routes/phase2-5-final-physical-cleanup.md
- docs/product_architecture_reset_routes/phase2-goal2-turn-session-cli-physical-split.md
- docs/product_architecture_reset_routes/phase2-goal1-domain-layout-orchestration-decomposition.md
- docs/product-architecture-reset/phase2-final-physical-audit.md
- docs/product-architecture-reset/07-testing-and-validation-strategy.md
- packages/ts-shell/src/orchestration/runMvpIntegratedFlow.test.ts
- current runMvpIntegratedFlow implementation and moved domain modules as needed

Use current code as truth, but do not blindly bless current behavior.

## Goal

Make the full command pass:

npm test -w packages/ts-shell -- src/orchestration/runMvpIntegratedFlow.test.ts

COMPLETE requires the full suite to be green.

The route must resolve every currently failing family from the drift register.

## Failure Families To Resolve

Resolve all families from the register:

- read/inspect and repo-diagnosis completion expectations
- command allowlist blocker text
- write-intent target/content classification
- continuation relocation blocker output text
- ambiguous target/blocker wording
- verification status vocabulary
- low-risk edit/write success expectations
- continuation lineage evidence marker
- verify continuation blocker text

For each failure, decide and implement one of:

1. Fix runtime if current behavior is wrong.
2. Update test if expectation is stale and current behavior is truthful.
3. Move or rewrite deprecated characterization into explicit legacy/current contract coverage.
4. Replace duplicate route-era coverage with current product/domain test coverage.

No failure may remain merely documented.

## Hard Rules

Do not run live provider.

Do not add features unrelated to the failing tests.

Do not weaken evidence/verdict truthfulness.

Do not convert stopped, partial, blocked, skipped, not-run, no-provider, or not-proven into success just to satisfy old tests.

Do not hide failures by deleting coverage without replacement or explicit deprecated/legacy handling.

Do not mass rebaseline output text without understanding the owning contract.

Do not change provider default behavior.

Do not change production write default.

Do not break Route221 anti-false-success, result contract, CLI truthfulness, or current domain facades.

## Execution Phases

### Phase 1: Reproduce And Map

Run the full runMvp test command.

Map each current failure to:

- register family
- owning contract
- fix strategy
- expected files touched
- risk level

Use focused subagents and Serena for symbol/reference inspection.

Do not edit before this plan exists.

### Phase 2: Resolve Low-Risk Stale Expectations

Handle stale tests where current behavior is already truthful and covered by current product semantics.

Expected areas may include:

- terminal wording
- verification vocabulary
- blocker wording
- continuation output surfaces

Update tests narrowly and preserve truthfulness.

### Phase 3: Resolve Runtime Or Contract Drift

For failures where current behavior appears wrong or ambiguous, fix the responsible runtime/domain code or adjust the contract explicitly.

Likely areas may include:

- read/diagnosis routing
- command allowlist blockers
- write-intent classification
- edit/write success contracts
- continuation and verify continuation surfaces

Use new domain modules where possible. Do not add new orchestration dumping.

### Phase 4: Deprecated / Duplicate Characterization Cleanup

For route-era cases that no longer represent current product contract:

- move them into explicit legacy characterization sections, or
- rewrite them to assert current contract, or
- replace them with narrower product/domain tests

Do not remove coverage silently.

### Phase 5: Full Validation

Run:

- npm test -w packages/ts-shell -- src/orchestration/runMvpIntegratedFlow.test.ts
- trusted focused baseline from the register if still useful
- npm run verify:result-contract
- npm run verify:route221-anti-false-success-gate
- npm run build -w packages/ts-shell
- import scan if runtime/domain imports changed
- git diff --check
- git status --short --branch

Do not run live provider.

## Serena Policy

Use Serena if available for:

- symbol overview
- find symbol
- find references
- impact analysis around failing test owners
- focused edits

Do not use Serena as validation replacement.

If onboarding requests memory writes and not needed, skip onboarding and continue.

## Completion Criteria

COMPLETE requires:

- full runMvpIntegratedFlow.test.ts command passes
- all 34 previous failures resolved
- no unresolved family remains
- no hidden failure deletion
- no false success or truthfulness weakening
- result contract passes
- Route221 gate passes
- build passes
- final report updates the drift register or adds a recovery note

PARTIAL if:

- some failures remain
- only classification/register updates happen
- full suite still fails
- fixes require broader feature work

BLOCKED if:

- resolving failures requires unsafe broad rewrite
- current product contract is genuinely ambiguous and cannot be safely decided

## Commit

Commit green checkpoints if useful.

Suggested prefix:

phase2-6-a:

Do not push.

## Final Report

Include:

1. Final status
2. Initial reproduced failure count
3. Families resolved
4. Runtime fixes vs test updates vs deprecated rewrites
5. Full suite result
6. Truthfulness impact
7. Validations
8. Serena usage
9. Files changed
10. Remaining debt
11. Commit hash if committed
