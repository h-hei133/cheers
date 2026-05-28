# Phase 3 Final Core Owner Closeout

## Purpose

Close the remaining core architecture debt after the previous Phase 3 cleanup routes.

This grouped route handles:

1. Per-file edit/patch planning ownership cleanup.
2. Evidence/result terminal mapping ownership cleanup.
3. Final Phase 3 architecture stop audit.

This is not feature work.
This is not script cleanup.
This is not broad route vocabulary cleanup.

The goal is to determine whether Phase 3 can finally stop, after removing or
explicitly justifying the remaining core owner concentration.

## Required Reading

Read before editing:

- docs/product-architecture-reset/finalConcentrationAudit/00-file-size-and-fanin-map.md
- docs/product-architecture-reset/finalConcentrationAudit/01-new-owner-concentration-audit.md
- docs/product-architecture-reset/finalConcentrationAudit/02-import-boundary-audit.md
- docs/product-architecture-reset/finalConcentrationAudit/03-runtime-dev-history-leakage-audit.md
- docs/product-architecture-reset/finalConcentrationAudit/05-remaining-architecture-debt-register.md
- docs/product-architecture-reset/finalConcentrationAudit/06-final-reset-verdict.md
- docs/product-architecture-reset/finalConcentrationAudit/07-next-implementation-routes.md
- packages/ts-shell/src/orchestration/patchResult/perFilePatchPlan.ts
- packages/ts-shell/src/orchestration/claimLedgerProjection.ts
- packages/ts-shell/src/core/query/resultMapper.ts
- packages/ts-shell/src/evidence/verdictFacade.ts
- current edit, patch, evidence, result, verification, repair, and policy tests
- latest package.json after script taxonomy cleanup

Use current code as truth.

## Goal

Clean or justify remaining core owner concentration.

COMPLETE requires:

1. perFilePatchPlan.ts no longer owns misplaced edit/result/projection logic, or
   its remaining responsibilities are proven to be rightful owner logic.
2. claimLedgerProjection.ts and resultMapper.ts no longer own misplaced
   evidence/result/terminal compatibility logic, or their remaining
   responsibilities are proven rightful owner logic.
3. a final Phase 3 architecture stop verdict is produced.

If either code side cannot be safely completed, stop and report PARTIAL.

## Core Rule: Ownership Correctness

Do not blindly make every file a hollow facade.

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
- edit/planning/
- edit/result/
- edit/proof/
- edit/multifile/
- policy/
- verification/
- repair/
- evidence/
- evidence/claims/
- evidence/projection/
- evidence/compatibility/
- result/
- result/terminal/
- result/projection/
- result/compatibility/
- shared/

## Phase A: Ownership Audit Before Edits

Before editing, produce an in-thread table:

- file/symbol/region
- current responsibility
- should stay or move
- real owner if moved
- target file
- why not current file
- compatibility strategy
- tests
- stop risk

No edits before this table exists.

## Phase B: Per-file Edit/Patch Planning Cleanup

Audit and clean perFilePatchPlan.ts.

Candidates, subject to audit:

- per-file patch plan construction
- exact hunk/proof planning
- patch result shaping
- failed/remaining/skipped file projection
- verification handoff coupling
- repair handoff coupling
- terminal status/result projection
- policy/authority-adjacent logic
- stale-read/readback projection
- mixed-file compatibility output

Expected owner destinations, subject to current code:

- edit/patch/
- edit/planning/
- edit/proof/
- edit/result/
- edit/multifile/
- policy/
- verification/
- repair/
- result/
- evidence/

Must preserve:

- no new writer
- no fuzzy apply
- no production write default
- no prompt-text write authority
- exact hunk/proof semantics
- per-file failure visibility
- partial/stopped/blocked truthfulness
- apply without verification is not verified success
- repair proposal/apply without reverify is not repair success

## Phase C: Evidence/Result Terminal Mapping Cleanup

Audit and clean claimLedgerProjection.ts and resultMapper.ts.

Candidates, subject to audit:

- claim ledger terminal projection
- not-proven / partial / blocked / stopped mapping
- actionable blocker classification
- report-safe claim projection
- historical route compatibility mapping
- evidence-to-terminal result adapter logic
- route-era compatibility vocabulary
- result mapper fallback precedence

Expected owner destinations, subject to current code:

- evidence/claims/
- evidence/projection/
- evidence/compatibility/
- result/terminal/
- result/projection/
- result/compatibility/

Must preserve:

- Route221 anti-false-success gate
- result contract
- Route227/228 compatibility
- historical report adapter behavior
- no false success
- no redaction weakening
- no raw provider/DOM/process/config/secret output as evidence

## Phase D: Final Architecture Stop Audit

After code cleanup or justified no-move decisions, create or update:

- docs/product-architecture-reset/finalConcentrationAudit/08-phase3-final-stop-verdict.md

The audit must answer:

- Can Phase 3 stop?
- Which core product files remain large, and are they rightful owners?
- Are any blocker debts left?
- Are remaining debts safe to defer?
- Does product runtime import docs/scripts/dev-history/route reports?
- Are route-era names only compatibility/history, not product truth?
- Is feature work safe to resume?
- What exact future cleanup remains optional?

## Strict Non-Goals

Do not add features.

Do not run live provider.

Do not change provider defaults.

Do not change production write defaults.

Do not add a new writer.

Do not add fuzzy apply.

Do not infer write authority from prompt text.

Do not skip stale-read protection.

Do not weaken evidence/verdict truthfulness.

Do not convert partial/stopped/blocked/skipped/not-run/no-provider/not-proven
into success.

Do not remove Route221/227/228 compatibility without replacement.

Do not move route docs/reports/package scripts.

Do not touch SessionManager/CLI/planning/runtime unless import compatibility
requires it.

Do not mass-format unrelated code.

## Validation

Required:

- focused per-file patch plan tests
- focused edit/patch/proof/multifile tests for moved edit modules
- focused claim ledger tests
- focused resultMapper tests
- focused evidence/verdict/result compatibility tests
- npm run verify:result-contract
- npm run verify:route221-anti-false-success-gate
- npm run build -w packages/ts-shell
- product/runtime import scan for docs/scripts/dev-history leakage
- git diff --check
- git status --short --branch

Run if touched:

- runMvpIntegratedFlow.test.ts if runtime result flow imports change
- verify:product:cli-entry if terminal output changes
- Route227/228 compatibility checks if historical adapter behavior changes
- workspace/edit/mixed-file route tests if edit result paths move

Do not run live provider.

## Completion Criteria

COMPLETE requires:

- ownership audit table completed before edits
- perFilePatchPlan.ts either cleaned or justified as rightful owner with no
  misplaced large responsibilities
- claimLedgerProjection.ts/resultMapper.ts either cleaned or justified as
  rightful owners with no misplaced large responsibilities
- moved code lands in real owner modules
- compatibility exports/adapters preserved
- final stop verdict written
- result contract and Route221 gate pass
- build passes
- no truthfulness/redaction drift
- final report says whether Phase 3 can stop

PARTIAL if:

- only one side is handled
- final stop verdict cannot conclude
- tests fail
- behavior compatibility is uncertain
- code moves into vague buckets

BLOCKED if:

- safe cleanup requires feature redesign
- Route221/227/228 compatibility cannot be preserved
- truthfulness or redaction would weaken

## Serena Policy

Use Serena if available for:

- symbol overview
- find references
- ownership clustering
- impact analysis for perFilePatchPlan, claimLedgerProjection, resultMapper,
  verdictFacade, and moved owner modules

Do not use Serena as validation replacement.

If onboarding asks for memory writes and memory updates are not needed, skip and
continue.

## Commit

Commit if green.

Suggested prefix:

phase3-final-core:

Do not push.

## Final Report

Include:

1. Final status
2. Ownership audit summary
3. Per-file edit/patch cleanup or justification
4. Evidence/result cleanup or justification
5. Target owner modules
6. Compatibility shims/adapters
7. Product behavior changed yes/no
8. Truthfulness/redaction impact
9. Validation results
10. Serena usage
11. Final stop verdict summary
12. Remaining optional debt
13. Commit hash if committed
14. Whether feature work can resume
