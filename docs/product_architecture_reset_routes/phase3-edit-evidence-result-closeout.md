# Phase 3: Edit/Write And Evidence/Result Ownership Closeout

## Purpose

Clean the next product-core architecture debt after planning/runtime and session/CLI closeout.

This grouped route handles:

1. Edit/write route ownership cleanup.
2. Evidence/result compatibility concentration cleanup.

This is not feature work.
This is not script cleanup.
This is not route vocabulary cleanup by itself.

The goal is to make edit/write logic belong to edit-owned modules and evidence/result logic belong to evidence/result-owned modules, while preserving all existing behavior and truthfulness.

## Required Reading

Read before editing:

- docs/product-architecture-reset/finalConcentrationAudit/00-file-size-and-fanin-map.md
- docs/product-architecture-reset/finalConcentrationAudit/01-new-owner-concentration-audit.md
- docs/product-architecture-reset/finalConcentrationAudit/02-import-boundary-audit.md
- docs/product-architecture-reset/finalConcentrationAudit/05-remaining-architecture-debt-register.md
- docs/product-architecture-reset/finalConcentrationAudit/06-final-reset-verdict.md
- docs/product-architecture-reset/finalConcentrationAudit/07-next-implementation-routes.md
- packages/ts-shell/src/orchestration/patchResult/mixedFileWriteRoute.ts
- packages/ts-shell/src/orchestration/patchResult/perFilePatchPlan.ts
- packages/ts-shell/src/orchestration/claimLedgerProjection.ts
- packages/ts-shell/src/evidence/verdictFacade.ts
- packages/ts-shell/src/core/query/resultMapper.ts
- current edit, verification, repair, evidence, result, policy tests

Use current code as truth.

## Goal

Move edit/write-owned implementation out of route-era orchestration paths where safe, and reduce evidence/result compatibility concentration without weakening Route221/227/228 truthfulness compatibility.

COMPLETE requires both:

1. At least one meaningful edit/write route family moved or re-owned into edit/policy/verification/repair owner modules.
2. At least one meaningful evidence/result compatibility family moved or re-owned into evidence/result owner modules.

If either side cannot be safely completed, stop and report PARTIAL.

## Core Rule: Ownership Correctness

Do not blindly turn every file into a hollow facade.

A file may keep real logic if it is the rightful owner.

Move only misplaced responsibilities.

Do not create vague buckets:

- helper
- helpers
- utils
- misc
- common
- support
- legacy
- mvp

Use real owner modules:

- edit/
- edit/patch/
- edit/multifile/
- edit/planning/
- edit/result/
- policy/
- verification/
- repair/
- evidence/
- evidence/claims/
- evidence/compatibility/
- result/
- result/projection/
- shared/

## Phase A: Ownership Audit Before Edits

Before editing, produce an in-thread table:

- symbol/region
- current responsibility
- should stay or move
- real owner domain
- target file
- why not current orchestration/evidence file
- compatibility strategy
- tests
- stop risk

No edits before this table exists.

## Phase B: Edit/Write Route Ownership Cleanup

Audit and move clear edit/write subdomain logic.

Candidates, subject to audit:

- mixed file write route planning
- per-file patch plan construction
- partial success/failure aggregation
- stopped/blocked/partial write state shaping
- patch proof/journal handoff
- workspace authority coupling
- stale-read/readback coupling
- repair handoff coupling
- verification handoff coupling

Expected owner destinations, subject to code:

- edit/multifile/
- edit/patch/
- edit/planning/
- edit/result/
- edit/workspace/
- policy/
- verification/
- repair/

Keep behavior stable:

- no new writer
- no fuzzy apply
- no production write default
- no prompt-text write authority
- stale-read protection remains
- partial file failure is not success
- apply without verification is not verified success
- repair proposal/apply without reverify is not repair success

## Phase C: Evidence/Result Compatibility Cleanup

Audit and move clear evidence/result subdomain logic.

Candidates, subject to audit:

- claim ledger projection internals
- route-era compatibility claim projection
- resultMapper truthfulness adapter logic
- verdict facade compatibility sections
- report-safe projection helpers
- terminal state classification helpers
- not-proven / partial / blocked / stopped mapping
- historical report adapter logic

Expected owner destinations, subject to code:

- evidence/claims/
- evidence/projection/
- evidence/compatibility/
- result/projection/
- result/terminal/
- result/compatibility/

Keep compatibility stable:

- Route221 anti-false-success gate still passes
- Route227/228 compatibility remains
- historical report adapters still work
- no stopped/partial/not-proven state becomes success
- no redaction weakening
- no raw provider/DOM/process/config/secret output becomes evidence

## Phase D: Boundary And Compatibility

Old imports must keep working through narrow shims if needed.

Do not move route reports/docs/scripts.

Do not change package scripts.

Do not change provider defaults.

Do not change live provider behavior.

Do not touch SessionManager/CLI unless strictly required by import compatibility.

## Strict Non-Goals

Do not add features.

Do not run live provider.

Do not change product behavior.

Do not change provider defaults.

Do not change production write defaults.

Do not add new edit capability.

Do not weaken evidence/verdict truthfulness.

Do not convert partial/stopped/blocked/skipped/not-run/no-provider/not-proven into success.

Do not remove Route221/227/228 compatibility without replacement.

Do not mass-format unrelated code.

## Validation

Required:

- focused mixed-file/per-file patch tests
- focused edit/patch/mutation/workspace tests for moved edit modules
- focused repair tests if repair handoff is touched
- focused verification tests if verification handoff is touched
- focused evidence/verdict/resultMapper tests for moved result/evidence modules
- npm run verify:result-contract
- npm run verify:route221-anti-false-success-gate
- npm run build -w packages/ts-shell
- product/runtime import scan for docs/scripts/dev-history leakage
- git diff --check
- git status --short --branch

Run if touched:

- runMvpIntegratedFlow.test.ts if runtime write/result flow imports change
- verify:product:cli-entry if terminal output changes
- Route227/228 report compatibility checks if historical adapter paths change

Do not run live provider.

## Completion Criteria

COMPLETE requires:

- ownership audit table completed before edits
- at least one meaningful edit/write family moved to rightful owner modules
- at least one meaningful evidence/result family moved to rightful owner modules
- old imports and compatibility behavior preserved
- no false success or redaction weakening
- Route221 gate passes
- result contract passes
- build passes
- remaining edit/evidence debt listed honestly

PARTIAL if:

- only edit or only evidence side is cleaned
- only comments/docs change
- tests fail
- behavior compatibility is uncertain
- moved code lands in vague buckets

BLOCKED if:

- safe cleanup requires feature redesign
- Route221/227/228 compatibility cannot be preserved
- truthfulness or redaction would weaken

## Serena Policy

Use Serena if available for:

- symbol overview
- find references
- ownership clustering
- impact analysis for mixedFileWriteRoute, perFilePatchPlan, claimLedgerProjection, verdictFacade, and resultMapper

Do not use Serena as validation replacement.

If onboarding asks for memory writes and memory updates are not needed, skip and continue.

## Commit

Commit if green.

Suggested prefix:

phase3-edit-evidence:

Do not push.

## Final Report

Include:

1. Final status
2. Ownership audit summary
3. Edit/write families moved
4. Evidence/result families moved
5. Target owner modules
6. Compatibility shims/exports
7. Product behavior changed yes/no
8. Truthfulness/redaction impact
9. Validation results
10. Serena usage
11. Remaining edit/evidence debt
12. Commit hash if committed
13. Whether next route should be script taxonomy or route vocabulary/harness cleanup
