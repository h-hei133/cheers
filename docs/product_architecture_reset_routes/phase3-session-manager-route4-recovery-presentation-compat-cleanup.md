# Phase 3 SessionManager Route 4: Recovery Presentation, Workspace Binding, And Compatibility Cleanup

## Purpose

Finish the current SessionManager cleanup wave:

packages/ts-shell/src/session/SessionManager.ts

Route 1 extracted store, schema, transcript, and current-session registry owners.
Route 2 extracted replay, recovery snapshot, runtime seed, query event persistence, and lifecycle read model.
Route 3 extracted continuity snapshot, legacy memory compatibility, result truth adapter, approval memory, and request-scope facts.

Route 4 combines the remaining compatible cleanup areas:

1. Recovery selection and reentry presentation surface.
2. Workspace binding and project-root rebase wrappers.
3. Prompt continuity facade wrapper cleanup.
4. Dead residue and compatibility cleanup.

This route should make SessionManager.ts a small compatibility facade over named session owners, not a behavior-owning monolith.

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
- Route 1, Route 2, and Route 3 owner modules and tests
- current session recovery, presentation, store, continuation, approval, replay, and schema modules
- CLI/session surface tests if presentation strings or CLI-facing surfaces are touched

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

- session/recovery/
- session/presentation/
- session/store/
- session/continuation/
- session/schema/
- session/approval/
- session/replay/

Expected destinations, subject to inspection:

- packages/ts-shell/src/session/recovery/sessionResumeEligibility.ts
- packages/ts-shell/src/session/recovery/recoveryTrustBoundary.ts
- packages/ts-shell/src/session/recovery/sessionRecoverySelection.ts
- packages/ts-shell/src/session/recovery/projectContextSummary.ts
- packages/ts-shell/src/session/presentation/sessionReentrySurface.ts
- packages/ts-shell/src/session/presentation/sessionWarningSurface.ts
- packages/ts-shell/src/session/store/sessionProjectBinding.ts
- packages/ts-shell/src/session/continuation/sessionRootRebase.ts
- packages/ts-shell/src/session/continuation/sessionPromptContinuity.ts
- existing owner modules if they already exist

If files already exist, integrate into them instead of duplicating.

## Goal

Make SessionManager.ts a thin public compatibility facade.

SessionManager should keep:

- public class export
- constructor compatibility
- public method names used by CLI/runtime/shell
- public type re-exports when still needed
- high-level delegation to owner modules

SessionManager should stop deeply owning:

- recovery candidate selection
- recovery trust-boundary block construction
- reentry summary projection
- project context aggregation
- CLI/session-facing warning surfaces
- workspace binding update internals
- project-root rebase with continuity memory mutation
- prompt continuity context/snapshot construction
- stale compatibility wrappers or private helpers proven dead

## Required Scope

Complete all checkpoints unless safety blocks:

1. Recovery selection and reentry presentation extraction.
2. Workspace binding and project-root rebase wrapper extraction.
3. Prompt continuity wrapper extraction.
4. Dead residue and compatibility cleanup with proof.

If an earlier checkpoint cannot complete safely, stop and report PARTIAL. Do not hide by only deleting easy residue.

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

## Checkpoint B: Recovery Selection And Reentry Presentation

Move recovery selection, recovery trust-boundary projection, project context aggregation, and reentry presentation into named recovery/presentation owners.

Candidates:

- SessionReentrySummary type if still local
- ProjectContextSummary type if still local
- listRecentProjectContexts internals
- listReentrySummaries internals
- getSuggestedRecoverySession internals
- getRecoveryTrustBoundaryBlock internals
- describeSessionReentry internals
- getSessionResumeEligibility internals
- evaluateRecoveryTrustBoundary
- hasResumeContextEvidence
- createRecoveryTrustBoundaryBlock
- unreadable directory warning surface if still manager-owned

Must preserve:

- facade methods and return shapes
- recovery candidate ordering
- interrupted/error/stopped eligibility semantics
- indeterminate terminal evidence not becoming resumable
- CLI-facing strings unless deliberately re-owned with exact compatibility
- unreadable directory warning behavior

Do not change terminal truth.

## Checkpoint C: Workspace Binding And Project-Root Rebase

Move workspace binding update and session project-root rebase internals into store/continuation owners.

Candidates:

- rebindSessionProjectRoot internals
- updateSessionWorkspaceBinding internals
- metadata binding update logic
- working-memory anchor rebase
- legacy project-root residue rebase calls if still manager-owned

Likely destinations:

- session/store/sessionProjectBinding.ts
- session/continuation/sessionRootRebase.ts

Must preserve:

- metadata project root binding
- workspace root mode
- requested workspace metadata
- target base and git root metadata
- old project-root anchor rebase behavior
- no session schema migration
- no old-session compatibility loss

## Checkpoint D: Prompt Continuity Facade Cleanup

Move prompt continuity context/snapshot builder wrappers into session/continuation owner modules where not already done.

Candidates:

- buildPromptContinuityContext internals
- buildPromptContinuitySnapshot internals
- prompt-continuity formatting around SessionContinuitySnapshot

Likely destination:

- session/continuation/sessionPromptContinuity.ts

Must preserve:

- public facade methods
- prompt continuity output shape
- continuation evidence parity
- stopped/partial/not-proven continuation truth

## Checkpoint E: Dead Residue And Compatibility Cleanup

Remove or rehome only proven-dead residue.

Allowed:

- remove private helpers with direct `rg` proof and TypeScript build proof
- migrate internal type imports away from SessionManager.ts when owner modules now exist
- remove stale compatibility wrappers only if no production/test callers remain
- keep compatibility re-exports if callers still use them

Must preserve:

- any public method used by CLI/runtime/shell/tests
- any old-session compatibility path
- any session schema field
- any terminal/durable status field
- any transcript repair behavior

Do not delete legacy parsing that still protects old session records.

## Strict Non-Goals

Do not change session schema.

Do not change store/transcript file layout.

Do not change replay/recovery read-model truth.

Do not change continuity snapshot shape.

Do not change approval memory semantics.

Do not change result/evidence truthfulness.

Do not edit CLI behavior except import/type updates required by moved session owners.

Do not run live provider.

Do not move route docs/reports/package scripts.

Do not mass-format unrelated files.

Do not delete anything without direct reference proof and build proof.

## Compatibility

Keep current public imports and methods working from SessionManager.ts.

If types move, re-export them from SessionManager.ts unless all callers are migrated safely.

New modules must not import SessionManager.ts.

Avoid import cycles between session/recovery, session/presentation, session/store, session/continuation, and SessionManager.ts.

## Validation

Required after Checkpoint B:

- npm test -w packages/ts-shell -- src/session/SessionManager.test.ts
- npm test -w packages/ts-shell -- src/session/sessionRecoverySelection.test.ts
- shell recovery tests if recovery eligibility or trust-boundary logic moves
- CLI/session surface tests if rendered strings or session surfaces are touched
- npm run build -w packages/ts-shell
- git diff --check

Required after Checkpoint C/D/E and final:

- npm test -w packages/ts-shell -- src/session/SessionManager.test.ts
- npm test -w packages/ts-shell -- src/session/continuationEvidenceParity.test.ts
- npm test -w packages/ts-shell -- src/session/sessionResumeContextBuilder.test.ts
- npm test -w packages/ts-shell -- src/session/stoppedSessionContinuity.test.ts
- focused tests for new recovery/presentation/store/continuation modules
- old-session compatibility subset if any compatibility wrapper or legacy path is touched
- npm run build -w packages/ts-shell
- import scan for new session modules importing SessionManager.ts
- product/runtime import scan for docs/scripts/dev-history leakage
- git diff --check
- git status --short --branch

Run npm run verify:result-contract and npm run verify:route221-anti-false-success-gate if any terminal truth, result/evidence, stopped/partial/not-proven, or continuity truth surface is touched.

Do not run live provider.

## Completion Criteria

COMPLETE requires:

- ownership table completed before edits
- recovery selection/presentation extracted
- workspace binding/project-root rebase extracted
- prompt continuity facade extracted
- dead residue cleaned only with proof
- SessionManager.ts visibly smaller and delegates these responsibilities
- no generic helper/sessionUtils bucket movement
- public facade methods preserved
- no session schema drift
- no terminal/recovery/continuity truth drift
- no CLI-facing presentation drift unless explicitly preserved by tests
- focused tests and build pass
- remaining SessionManager responsibilities and line count listed

PARTIAL if:

- only one checkpoint lands
- compatibility cleanup is unsafe
- presentation or recovery ordering changes unexpectedly
- focused tests fail
- behavior compatibility is uncertain

BLOCKED if:

- extraction requires session schema migration
- import cycles cannot be avoided
- public API compatibility cannot be preserved
- terminal truth would weaken

## Serena Policy

Use Serena if available for symbol overview, references, call graph, and ownership clustering.

Do not use Serena as validation replacement.

If onboarding asks for memory writes and memory updates are not needed, skip onboarding and continue.

## Commit

Commit green checkpoint if useful.

Suggested prefix:

phase3-session-route4:

Do not push.

## Final Report

Include:

1. Final status
2. Ownership audit summary
3. Recovery/presentation files moved or created
4. Workspace binding/rebase files moved or created
5. Prompt continuity files moved or created
6. Compatibility cleanup done
7. Compatibility strategy
8. Product behavior changed yes/no
9. Session schema impact
10. Recovery/presentation impact
11. Continuity truth impact
12. Validation results
13. Serena usage
14. Remaining SessionManager responsibilities
15. SessionManager line count
16. Commit hash if committed
17. Whether SessionManager cleanup is complete or needs another route
