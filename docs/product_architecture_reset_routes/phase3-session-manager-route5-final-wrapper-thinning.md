# Phase 3 SessionManager Route 5: Final Facade Thinning And Lifecycle Wrapper Cleanup

## Purpose

Finish the current SessionManager cleanup.

Current target:

packages/ts-shell/src/session/SessionManager.ts

After Routes 1-4, SessionManager is no longer a session monolith, but it still has around 1100 lines and owns too much facade wiring:

- constructor/store layout wiring
- create/load/resume/lifecycle wrappers
- transcript/query event wrappers
- recovery/replay/continuity facade delegation
- persistence callback glue

This route should make SessionManager.ts as close as possible to a thin compatibility facade.

This is implementation work.

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
- Route 1-4 owner modules and tests

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

- session/store/
- session/lifecycle/
- session/transcript/
- session/recovery/
- session/replay/
- session/continuation/
- session/approval/
- session/presentation/
- session/schema/

Expected destinations, subject to inspection:

- session/lifecycle/sessionLifecycleStore.ts
- session/lifecycle/sessionTerminalStore.ts
- session/lifecycle/sessionPromptBarrier.ts
- session/recovery/sessionResume.ts
- session/store/sessionCreation.ts
- session/store/sessionLoadFacade.ts
- session/transcript/sessionQueryEventPersistence.ts
- existing owner modules from Routes 1-4

If files already exist, integrate into them instead of duplicating.

## Goal

Make SessionManager.ts a thin public compatibility facade.

SessionManager may keep:

- public class export
- constructor
- public method names
- public type re-exports still used externally
- dependency construction
- one-line or small delegation methods
- compatibility comments if necessary

SessionManager should stop owning:

- lifecycle state transition implementation
- terminal save implementation
- prompt barrier implementation
- resume/tryResume implementation details
- session creation/load composition details
- transcript/query event persistence details
- callback glue that can live in store/lifecycle/transcript owners
- private helper residue that can be proven dead or moved

## Required Scope

Complete all checkpoints unless safety blocks:

1. Lifecycle and terminal wrapper extraction.
2. Creation/load/resume wrapper thinning.
3. Transcript/query event wrapper thinning.
4. Dead private residue and import cleanup.
5. Final line-count and owner-boundary audit.

If a checkpoint cannot complete safely, stop and report PARTIAL. Do not hide by only deleting easy residue.

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

## Checkpoint B: Lifecycle And Terminal Wrapper Extraction

Move lifecycle state transitions and terminal persistence internals into session/lifecycle owners.

Candidates:

- markRunStarted internals
- persistUserPromptBarrier internals
- markTurnActive internals
- markRecoveryReentry internals
- saveInterrupted internals
- saveCompleted internals
- saveError internals
- saveTerminated internals
- terminal persistence assembly if still local

Likely destinations:

- session/lifecycle/sessionLifecycleStore.ts
- session/lifecycle/sessionTerminalStore.ts
- session/lifecycle/sessionPromptBarrier.ts
- session/recovery/sessionRecoveryLifecycle.ts if recovery-specific

Must preserve:

- public facade method names
- lifecycle status transitions
- pending prompt metadata
- terminal persistence fields
- lastError preservation rules
- durable status semantics
- no false success
- interrupted/stopped/error/completed distinctions

## Checkpoint C: Creation, Load, Resume Wrapper Thinning

Move remaining create/load/resume composition details to store/recovery owners.

Candidates:

- createNewWithId internals
- createNew internals
- resume internals
- tryResume delegation glue if still heavy
- load callback wiring
- workspace binding defaults if still local

Likely destinations:

- session/store/sessionCreation.ts
- session/store/sessionLoadFacade.ts
- session/recovery/sessionResume.ts
- existing session/store/sessionStore.ts

Must preserve:

- session id behavior
- createdAt/updatedAt behavior
- title behavior
- current-session selection side effects
- project root binding
- resume metadata behavior
- corrupt/unreadable session behavior
- public return shapes

## Checkpoint D: Transcript And Query Event Wrapper Thinning

Move any remaining transcript/query persistence glue to transcript/recovery owners.

Candidates:

- appendQueryEvent facade internals if still non-trivial
- getTranscriptEvents wrapper internals if still non-trivial
- normalizeTranscriptEvents / repairTranscriptEvents compatibility wrappers if they can delegate more narrowly
- persistence callback glue used by replay/recovery/query event owners

Likely destinations:

- session/transcript/sessionTranscript.ts
- session/transcript/sessionQueryEventPersistence.ts
- session/recovery/sessionLifecycleReadModel.ts
- session/replay/sessionReplayFacade.ts

Must preserve:

- transcript append/read order
- query event persistence
- pending lifecycle read model
- replay repair parity
- public facade method names

## Checkpoint E: Dead Residue And Import Cleanup

Delete or rehome only proven-dead residue.

Allowed:

- remove private helpers with direct rg proof and TypeScript build proof
- migrate internal imports away from SessionManager.ts when owner modules now exist
- remove stale type re-exports only if no external callers remain
- keep compatibility re-exports if callers still use them

Must preserve:

- public methods used by CLI/runtime/shell/tests
- old-session compatibility
- session schema fields
- transcript repair behavior
- terminal/durable status fields

## Strict Non-Goals

Do not change session schema.

Do not change transcript file format.

Do not change continuity snapshot shape.

Do not change approval memory semantics.

Do not change recovery/replay truth.

Do not change CLI behavior.

Do not change package scripts.

Do not run live provider.

Do not move route docs/reports.

Do not weaken result/evidence truthfulness.

Do not turn stopped/blocked/partial/skipped/not-run/no-provider/not-proven into success.

Do not delete public compatibility without caller proof.

Do not mass-format unrelated files.

## Compatibility

Keep current public imports and methods working from SessionManager.ts.

If type re-exports are still used, keep them.

New modules must not import SessionManager.ts.

Avoid import cycles between SessionManager.ts and session owner modules.

## Validation

Required:

- npm test -w packages/ts-shell -- src/session/SessionManager.test.ts
- npm test -w packages/ts-shell -- src/session/sessionManagerBoundary.test.ts
- npm test -w packages/ts-shell -- src/session/sessionReplayBuilder.test.ts
- npm test -w packages/ts-shell -- src/session/continuationEvidenceParity.test.ts
- npm test -w packages/ts-shell -- src/session/sessionResumeContextBuilder.test.ts
- npm test -w packages/ts-shell -- src/session/stoppedSessionContinuity.test.ts
- focused tests for new lifecycle/store/recovery/transcript modules
- shell recovery tests if resume/recovery lifecycle moves
- npm run build -w packages/ts-shell
- import scan for new session modules importing SessionManager.ts
- import scan for external callers of removed type re-exports or wrappers
- product/runtime import scan for docs/scripts/dev-history leakage
- git diff --check
- git status --short --branch

Run npm run verify:result-contract and npm run verify:route221-anti-false-success-gate if terminal truth, durable status, result/evidence, stopped/partial/not-proven, or continuity truth surfaces are touched.

Do not run live provider.

## Completion Criteria

COMPLETE requires:

- ownership table completed before edits
- lifecycle/terminal wrappers extracted or proven already thin
- creation/load/resume wrappers extracted or proven already thin
- transcript/query wrappers extracted or proven already thin
- dead private residue cleaned only with proof
- SessionManager.ts visibly smaller
- no generic helper/sessionUtils bucket movement
- public facade compatibility preserved
- no schema/transcript/recovery/continuity/approval/truth drift
- tests/build pass
- remaining SessionManager responsibilities listed
- final judgment whether SessionManager cleanup is complete

PARTIAL if:

- only easy residue cleanup lands
- lifecycle or resume wrappers remain heavy without reason
- import cycles cannot be resolved
- focused tests fail
- behavior compatibility is uncertain

BLOCKED if:

- extraction requires session schema migration
- public API compatibility cannot be preserved
- terminal truth would weaken

## Serena Policy

Use Serena if available for symbol overview, references, call graph, and ownership clustering.

Do not use Serena as validation replacement.

If onboarding asks for memory writes and memory updates are not needed, skip onboarding and continue.

## Commit

Commit green checkpoint if useful.

Suggested prefix:

phase3-session-route5:

Do not push.

## Final Report

Include:

1. Final status
2. Ownership audit summary
3. Lifecycle files moved/created
4. Creation/load/resume files moved/created
5. Transcript/query files moved/created
6. Compatibility cleanup done
7. Compatibility strategy
8. Product behavior changed yes/no
9. Session schema impact
10. Terminal/recovery/continuity truth impact
11. Validation results
12. Serena usage
13. Remaining SessionManager responsibilities
14. SessionManager line count
15. Commit hash if committed
16. Whether SessionManager cleanup is now complete
