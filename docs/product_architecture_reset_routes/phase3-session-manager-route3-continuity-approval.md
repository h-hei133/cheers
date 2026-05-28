# Phase 3 SessionManager Route 3: Continuity Snapshot, Legacy Memory, And Approval Facts

## Purpose

Continue reducing:

packages/ts-shell/src/session/SessionManager.ts

Route 1 extracted store, schema, transcript, and current-session registry owners.
Route 2 extracted recovery snapshot, replay, runtime seed, query event persistence, and pending lifecycle read model.

Route 3 combines the next tightly coupled session surfaces:

1. Continuity snapshot and legacy working-memory compatibility.
2. Approval memory, permission request, and request-scope facts.

This is implementation work.

This route is truth-sensitive. It must preserve old session compatibility, continuity snapshot shape, approval memory as evidence only, and no-false-success behavior.

## Required Reading

Read before editing:

- docs/product-architecture-reset/sessionManager/README.md
- docs/product-architecture-reset/sessionManager/00-current-map.md
- docs/product-architecture-reset/sessionManager/01-ownership-audit.md
- docs/product-architecture-reset/sessionManager/02-stay-vs-move.md
- docs/product-architecture-reset/sessionManager/03-extraction-targets.md
- docs/product-architecture-reset/sessionManager/04-risk-register.md
- docs/product-architecture-reset/sessionManager/05-validation-plan.md
- docs/product-architecture-reset/sessionManager/06-next-implementation-routes.md
- packages/ts-shell/src/session/SessionManager.ts
- packages/ts-shell/src/session/SessionManager.test.ts
- Route 1 and Route 2 session owner modules and tests
- existing session continuity, compact, approval, permission, mutation continuity, result, and evidence modules

Use current code as truth.

## Core Rule

Destination by ownership.

Do not create generic buckets:

- helper
- helpers
- utils
- misc
- common
- support
- managerHelpers
- sessionUtils

Use named owners:

- session/continuation/
- session/approval/
- session/summary/
- session/schema/ only for stable type reuse
- result/
- evidence/

Expected destinations, subject to inspection:

- packages/ts-shell/src/session/continuation/sessionContinuitySnapshot.ts
- packages/ts-shell/src/session/continuation/sessionPromptContinuity.ts
- packages/ts-shell/src/session/continuation/sessionUnresolvedItems.ts
- packages/ts-shell/src/session/continuation/sessionReadContinuity.ts
- packages/ts-shell/src/session/continuation/sessionMutationContinuity.ts
- packages/ts-shell/src/session/continuation/sessionToolContinuity.ts
- packages/ts-shell/src/session/continuation/legacyContinuityMemory.ts
- packages/ts-shell/src/session/continuation/legacyPermissionRebase.ts
- packages/ts-shell/src/session/continuation/sessionSeedInfluence.ts
- packages/ts-shell/src/session/approval/sessionApprovalMemory.ts
- packages/ts-shell/src/session/approval/sessionApprovalContinuity.ts
- packages/ts-shell/src/session/approval/sessionRequestScopeMemory.ts
- packages/ts-shell/src/result/sessionResultTruthAdapter.ts

If files already exist, integrate into them instead of duplicating.

## Goal

Make SessionManager a compatibility facade over continuity and approval owners.

SessionManager should keep public facade methods:

- buildContinuitySnapshot
- buildPromptContinuityContext
- buildPromptContinuitySnapshot
- recordApprovalAuditDecision

But it should stop deeply owning:

- main continuity snapshot construction
- terminal-source truth adapter
- unresolved item projection
- mutation/read/repair/verification/provenance continuity sub-projections
- legacy working-memory parsing
- legacy permission rebase
- seed influence parsing
- approval audit persistence internals
- approval provenance continuity
- permission request and request-scope continuity facts

## Required Scope

Complete both categories unless safety blocks:

1. Continuity snapshot and legacy working-memory extraction.
2. Approval memory and request-scope facts extraction.

If continuity extraction cannot complete safely, stop before approval extraction and report PARTIAL.

If continuity extraction completes but approval extraction cannot complete safely, report PARTIAL with continuity committed if green.

## Checkpoint A: Ownership Audit Before Edits

Before editing, produce an in-thread table:

- region/symbol
- current responsibility
- owner domain
- target file
- why not SessionManager facade
- compatibility strategy
- tests
- stop risk

No edits before this table exists.

## Checkpoint B: Continuity Snapshot And Legacy Working-Memory Extraction

Move continuity snapshot construction and legacy working-memory parsing into named continuation/result/evidence owners.

Candidates:

- buildContinuitySnapshot internals
- normalizeLegacyPermissionStateForSession
- applyAutoCompactRetention if tightly coupled to snapshot retention
- extractActionHandoffSummaryFromMemory
- extractWriteContinuityFromMemory
- extractSeedInfluenceFromMemory
- extractSeedInfluenceFromQueryResult
- extractSeedInfluenceHandoffSummaryFromMemory
- extractFailureHandoffDiagnosticFromMemory
- extractSuccessHandoffDiagnosticFromMemory
- unresolved item construction
- read-window/read-fragment continuity projection
- mutation continuity projection
- staged repair and answer defect continuity
- tool provenance continuity
- terminal-source truth adapter

Must preserve:

- SessionContinuitySnapshot field shape
- old session compatibility
- legacy working-memory key parsing
- auto-compact retention behavior
- mutation/read/repair/verification continuity fields
- tool and approval provenance fields
- terminal source rule preventing query-level success from upgrading coding-level non-success
- redaction and report-safe behavior
- no false success

Do not delete legacy parsing in this route.

## Checkpoint C: Approval Memory And Request-Scope Facts

Move approval audit memory, approval history, permission request facts, request-scope facts, and approval provenance continuity into approval owners.

Candidates:

- recordApprovalAuditDecision internals
- APPROVAL_AUDIT_HISTORY_LIMIT
- approval memory decode/history reads used in continuity snapshot
- permission request continuity facts
- request-scope memory/facts
- approval provenance continuity fields

Must preserve:

- recordApprovalAuditDecision facade method
- approval history limit
- approval memory as historical facts only
- approval memory is not write or command authority
- permission/request-scope cache-key behavior
- project-root normalization semantics
- old approval history through compaction
- no authority inferred from approval memory

Do not change write authorization policy or command execution approval.

## Strict Non-Goals

Do not extract recovery snapshot or replay again.

Do not change store/schema/transcript shape.

Do not extract recovery selection or presentation.

Do not edit CLI.

Do not edit SessionManager public API except internal delegation.

Do not run live provider.

Do not change provider behavior.

Do not change product behavior.

Do not change session schema.

Do not move route docs/reports/package scripts.

Do not weaken result/evidence truthfulness.

Do not turn stopped/blocked/partial/skipped/not-run/no-provider/not-proven into success.

Do not delete legacy working-memory compatibility.

Do not treat approval memory as authorization.

Do not mass-format unrelated files.

## Compatibility

Keep current public imports and methods working from SessionManager.ts.

If types move, re-export them from SessionManager.ts.

New modules must not import SessionManager.ts.

Avoid import cycles between session/continuation, session/approval, result, evidence, and SessionManager.ts.

## Validation

Required after Checkpoint B:

- npm test -w packages/ts-shell -- src/session/SessionManager.test.ts
- npm test -w packages/ts-shell -- src/session/mutationCompactContinuity.test.ts
- npm test -w packages/ts-shell -- src/session/longSessionDurability.test.ts
- npm test -w packages/ts-shell -- src/session/continuationEvidenceParity.test.ts
- npm test -w packages/ts-shell -- src/session/sessionCompactModule.test.ts
- focused tests for new continuation/result/evidence modules
- npm run verify:result-contract
- npm run verify:route221-anti-false-success-gate
- npm run build -w packages/ts-shell
- git diff --check

Required after Checkpoint C and final:

- npm test -w packages/ts-shell -- src/session/SessionManager.test.ts
- npm test -w packages/ts-shell -- src/session/approvalMemoryCodec.test.ts
- npm test -w packages/ts-shell -- src/session/approvalAuditProjection.test.ts
- npm test -w packages/ts-shell -- src/session/permissionRequestMemoryCodec.test.ts
- focused tests for new approval/request-scope modules
- npm run verify:result-contract
- npm run verify:route221-anti-false-success-gate
- npm run build -w packages/ts-shell
- import scan for new session modules importing SessionManager.ts
- product/runtime import scan for docs/scripts/dev-history leakage
- git diff --check
- git status --short --branch

Do not run live provider.

## Completion Criteria

COMPLETE requires:

- ownership table completed before edits
- continuity snapshot extracted
- legacy working-memory compatibility extracted but not deleted
- terminal-source truth adapter extracted or isolated safely
- approval memory extracted
- request-scope facts extracted
- SessionManager.ts visibly smaller and delegates these responsibilities
- no generic helper/sessionUtils bucket movement
- public facade methods preserved
- SessionContinuitySnapshot shape preserved
- approval memory remains evidence only, not authority
- result contract and Route221 gate pass
- focused tests and build pass
- remaining SessionManager responsibilities listed

PARTIAL if:

- only continuity extraction completes
- approval extraction fails or is unsafe
- legacy compatibility is uncertain
- focused tests fail
- behavior compatibility is uncertain

BLOCKED if:

- extraction requires session schema migration
- terminal truth would weaken
- old session compatibility cannot be preserved
- import cycles cannot be avoided

## Serena Policy

Use Serena if available for symbol overview, references, call graph, and ownership clustering.

Do not use Serena as validation replacement.

If onboarding asks for memory writes and memory updates are not needed, skip onboarding and continue.

## Commit

Commit green checkpoint if useful.

Suggested prefix:

phase3-session-route3:

Do not push.

## Final Report

Include:

1. Final status
2. Ownership audit summary
3. Continuity files moved/created
4. Approval/request-scope files moved/created
5. Compatibility strategy
6. Product behavior changed yes/no
7. Session schema impact
8. Continuity snapshot shape impact
9. Truthfulness/redaction impact
10. Approval authority impact
11. Validation results
12. Serena usage
13. Remaining SessionManager responsibilities
14. SessionManager line count
15. Commit hash if committed
16. Whether safe to start next session route
