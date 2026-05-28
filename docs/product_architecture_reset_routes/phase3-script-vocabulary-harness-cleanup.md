# Phase 3: Script Taxonomy, Route Vocabulary, And Harness/Browser Cleanup

## Purpose

Clean the remaining route-era outer surface after product-core closeout.

This grouped route handles:

1. Package script taxonomy compatibility cleanup.
2. Route vocabulary quarantine in product/runtime/evidence strings where safe.
3. Harness/browser namespace cleanup where safe.

This route must improve repository cleanliness without breaking compatibility,
truthfulness, evidence gates, report adapters, provider opt-in, or developer
commands.

This is not feature work.
This is not product runtime behavior work.
This is not live-provider work.

## Required Reading

Read before editing:

- docs/product-architecture-reset/finalConcentrationAudit/03-runtime-dev-history-leakage-audit.md
- docs/product-architecture-reset/finalConcentrationAudit/04-package-script-and-entrypoint-audit.md
- docs/product-architecture-reset/finalConcentrationAudit/05-remaining-architecture-debt-register.md
- docs/product-architecture-reset/finalConcentrationAudit/07-next-implementation-routes.md
- root package.json
- packages/ts-shell/package.json
- scripts/dev-history/README.md if present
- docs/dev-history/routes/README.md if present
- docs/evidence/history/route-reports/README.md if present
- packages/ts-shell/src/core/harness/**
- packages/ts-shell/src/core/context/browser*
- packages/ts-shell/src/verification/**
- packages/ts-shell/src/evidence/**
- packages/ts-shell/src/orchestration/** files with route-era labels

Use current code as truth.

## Goal

Reduce route-era surface pollution while preserving all existing compatibility.

COMPLETE requires:

1. A clearer package script taxonomy with old aliases preserved.
2. At least one meaningful route-era vocabulary family quarantined or renamed
   through compatibility-safe aliases/adapters.
3. At least one meaningful harness/browser fixture or namespace family cleaned,
   moved, or re-owned where safe.

If any phase cannot be safely completed, stop and report PARTIAL instead of
doing unsafe renames.

## Core Rule: Compatibility First, Product Surface Cleaner

Do not delete old route aliases without compatibility.

Do not remove Route221/227/228 compatibility names without adapter coverage.

Do not rename evidence labels if report/gate consumers depend on them unless
a compatibility mapping is added.

Do not move active evidence infra as if it were history.

Do not make historical route reports look like current product readiness.

Do not create vague buckets:

- helper
- helpers
- utils
- misc
- common
- support
- legacy

Use real owner locations:

- scripts/product/
- scripts/evidence/
- scripts/provider/
- scripts/release/
- scripts/dev-history/
- docs/dev-history/
- docs/evidence/history/
- packages/ts-shell/src/harness/
- packages/ts-shell/src/eval/
- packages/ts-shell/src/browser/
- packages/ts-shell/src/evidence/compatibility/
- packages/ts-shell/src/result/compatibility/

## Phase A: Surface Audit Before Edits

Before editing, produce an in-thread table:

- surface family
- current route-era exposure
- owner domain
- proposed target/alias
- compatibility strategy
- tests/commands
- stop risk

No edits before this table exists.

## Phase B: Package Script Taxonomy Cleanup

Clean root package.json command taxonomy without changing command behavior.

Expected work, subject to audit:

- group stable product commands clearly
- group product verification commands clearly
- group evidence gates clearly
- group route-history compatibility commands clearly
- group provider/live gates clearly and keep explicit opt-in
- keep direct verify:route* aliases as compatibility aliases or document
  deprecation
- update script command index/docs if present

Must preserve:

- old aliases still work
- no live provider default
- no provider credential exposure
- no product command behavior change
- no route-history command breakage

Representative validation must include old and new aliases.

## Phase C: Route Vocabulary Quarantine

Clean route-era names in safe product string surfaces where compatibility can
be preserved.

Candidates, subject to audit:

- route IDs in request IDs
- route IDs in evidence labels
- route IDs in provider/proposal smoke labels
- route-history command labels inside verification plans
- route-era labels in orchestration compatibility surfaces
- route-era names in evidence/verdict compatibility adapters

Expected work:

- introduce product-facing neutral names where safe
- keep historical aliases or mapping where reports/gates depend on route names
- move compatibility-specific route names under evidence/compatibility or
  result/compatibility when possible
- document intentional Route221/227/228 compatibility that cannot move yet

Must preserve:

- Route221 anti-false-success gate
- Route227/228 historical compatibility
- result contract
- no false success
- redaction behavior

## Phase D: Harness/Browser Namespace Cleanup

Clean route-era harness/browser fixture ownership where safe.

Candidates, subject to audit:

- core/harness route fixture IDs
- browser transaction/redaction fixtures
- core/context/browser* mixed runtime/fixture ownership
- harness files that are dev/eval/test support rather than product runtime

Expected work:

- move or re-own at least one meaningful harness/browser family
- preserve test imports through shims if needed
- keep browser transaction/redaction gates passing
- keep fake-secret and route-scoped redaction fixtures safe
- do not move true product browser runtime into harness

Must preserve:

- product runtime cannot import docs/scripts/dev-history
- browser runtime behavior
- redaction tests
- transaction gates

## Strict Non-Goals

Do not add features.

Do not run live provider.

Do not change provider defaults.

Do not change production write defaults.

Do not change product runtime behavior.

Do not weaken evidence/verdict truthfulness.

Do not change SessionManager, planning/runtime, or edit core unless import
compatibility requires it.

Do not delete route history.

Do not move active Route221 infra without adapter.

Do not remove old package aliases without compatibility.

Do not mass-format unrelated code.

## Validation

Required:

- representative old package aliases
- representative new grouped aliases
- provider default/off inspection
- npm run verify:result-contract
- npm run verify:route221-anti-false-success-gate
- browser transaction/redaction gate if browser/harness touched
- focused harness/browser tests for moved families
- build -w packages/ts-shell if TS changed
- product/runtime import scan for docs/scripts/dev-history leakage
- git diff --check
- git status --short --branch

Run if touched:

- Route227/228 report compatibility checks if report adapter/vocabulary changes
- evidence/verdict facade tests if evidence compatibility changes
- verification command plan tests if command labels change
- verify:product:cli-entry if package command entry aliases change

Do not run live provider.

## Completion Criteria

COMPLETE requires:

- surface audit table completed before edits
- script taxonomy visibly cleaner
- old script aliases preserved
- at least one route-vocabulary family safely quarantined/renamed/mapped
- at least one harness/browser namespace family cleaned or re-owned
- no route/evidence compatibility breakage
- result contract and Route221 gate pass
- no live-provider default change
- remaining route-era surface debt listed honestly

PARTIAL if:

- only scripts are cleaned
- only docs change
- no vocabulary/harness family is cleaned
- compatibility is uncertain
- tests fail

BLOCKED if:

- safe cleanup requires breaking Route221/227/228 compatibility
- provider opt-in semantics would change
- redaction or evidence truthfulness would weaken

## Serena Policy

Use Serena if available for:

- route-name reference search
- symbol overview around browser/harness/evidence/verification files
- impact analysis for renamed labels or moved fixtures

Do not use Serena as validation replacement.

If onboarding asks for memory writes and memory updates are not needed, skip and
continue.

## Commit

Commit if green.

Suggested prefix:

phase3-surface-cleanup:

Do not push.

## Final Report

Include:

1. Final status
2. Surface audit summary
3. Script taxonomy changes
4. Route vocabulary changes
5. Harness/browser changes
6. Compatibility aliases/mappings
7. Product behavior changed yes/no
8. Truthfulness/redaction impact
9. Validation results
10. Serena usage
11. Remaining route-era surface debt
12. Commit hash if committed
13. Whether next route should be CLI residual cleanup or final architecture audit
