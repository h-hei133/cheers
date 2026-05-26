# Migration Strategy

This strategy restructures without breaking current capabilities. It avoids
feature expansion and keeps compatibility shims until evidence proves each
phase safe.

## Phase 1: Artifact Inventory And Quarantine Index

Goal: classify existing docs, reports, scripts, and route runners without
moving them yet.

Likely touched:

- `docs/DOC_STATUS.md` or a replacement docs index.
- New docs under `docs/product-architecture-reset/` or future
  `docs/evidence/`.
- No product code.

Validation:

- Docs path checks.
- `git diff --check`.
- Status check.

Stop conditions:

- Any attempt to delete, archive, or rename route artifacts during the index
  phase.

## Phase 2: Evidence/Verdict Product Facade

Goal: create product-owned evidence, claim, and verdict types consumed by
reports and result projection.

Likely touched:

- New `product/evidence` or current equivalent under `orchestration` /
  `core/query`.
- Route221 anti-false-success gate consumers.
- Existing report emitters through compatibility adapters.

Validation:

- Report schema/anti-false-success gates.
- Focused result mapper tests.
- Route227/228 report compatibility checks.

Compatibility:

- Keep old report fields.
- Add adapters that map old route reports to the new verdict model.

Stop conditions:

- Any weakening of false-success checks, redaction, or not-proven semantics.

## Phase 3: Provider/Proposal Boundary Cleanup

Goal: separate provider receipts from proposal exactness and review authority.

Likely touched:

- `contextAwareProvider*`.
- `providerEditProposal.ts`.
- `providerExactPatchContract.ts`.
- `anchoredProposal*`.
- `planningMutationProposalBridge.ts`.
- CLI planning mutation execution facades.

Validation:

- Focused provider/proposal tests.
- Deterministic no-provider/no-apply cases.
- Route228 compatibility evidence without running live provider unless a later
  explicit opt-in route requires it.

Stop conditions:

- Provider call implies write authority.
- Raw provider output enters transcript/report.

## Phase 4: Edit/Verification/Repair Boundary Cleanup

Goal: make edit, verification, and repair consume each other through facades.

Likely touched:

- `controlledEditOperationRoute.ts`.
- `patchResult/*`, `patchApplication/*`, `patchVerification/*`.
- `taskRelevantVerificationRoute.ts`.
- `verificationRepairIterationFlow.ts`.

Validation:

- Workspace write route tests.
- Mutation-lane rejection regression.
- Focused verification dispatch tests.
- Repair-to-success tests.
- Result contract.

Stop conditions:

- Multi-file/add/delete/move/fuzzy/rollback behavior expands without a
  dedicated route.
- Stale-read or post-write verification is weakened.

## Phase 5: CLI/Session/Runtime Split

Goal: shrink `cli.tsx`, `SessionManager.ts`, and `runMvpIntegratedFlow.ts`
through facades and compatibility shims.

Likely touched:

- `entrypoints/cli*.ts`.
- `core/shell/sessionRuntime.ts`.
- `session/*`.
- `orchestration/runMvpIntegratedFlow.ts`.

Validation:

- CLI entry tests.
- Session lifecycle tests.
- Session durability long gate.
- Result/session parity tests.

Stop conditions:

- Session schema changes without a migration plan.
- CLI output truthfulness changes without result contract coverage.

## Phase 6: Docs/Scripts/Package Script Hygiene

Goal: group commands and route artifacts under product/release/evidence/provider
and route-history namespaces.

Likely touched:

- `package.json`.
- `scripts/*`.
- Docs indexes.
- Compatibility aliases.

Validation:

- Existing script aliases still work.
- New grouped aliases work.
- Release deterministic gate where package script routing changes.

Stop conditions:

- Removing old route scripts before downstream references are migrated.
- Changing provider opt-in behavior.

## Phase 7: Final Compatibility Audit

Goal: prove the restructure preserved current capability claims and did not
promote unproven claims.

Validation:

- Product path smoke tests.
- Focused capability regression tests.
- Evidence/report gates.
- Release deterministic gate if package scripts or runtime facades changed.
- Explicit opt-in provider gate only if provider-facing code changed and the
  route opens that gate.

## What Not To Migrate First

Do not start with:

- Rename-only moves of `runMvpIntegratedFlow.ts`, `SessionManager.ts`, or
  `cli.tsx`.
- Broad package script rewrites.
- Archiving route reports.
- Replacing the provider/auth core.
- Moving control-plane semantics into Rust.
- Expanding edit engine capability.

## Avoiding Route227/228 Regression

Preserve:

- Route227 PARTIAL vs COMPLETE distinctions.
- Route228 explicit opt-in live-provider classification.
- No provider called by default.
- No production default write.
- Provider call during apply remains false where claimed.
- Apply success requires passed verification when the claim requires it.
- Raw provider output remains excluded from reports.
