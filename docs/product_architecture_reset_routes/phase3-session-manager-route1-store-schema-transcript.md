# Phase 3 SessionManager Route 1: Store, Schema, And Transcript Boundary

## Purpose

Start reducing:

packages/ts-shell/src/session/SessionManager.ts

The audit classified SessionManager as a legitimate session facade/coordinator plus a partial session monolith. This route extracts the durable storage, schema, transcript, and current-session registry boundary first.

This route must make SessionManager a compatibility facade over named session store/schema/transcript owners.

This is implementation work, not another audit.

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
- existing session store, registry, event codec, metadata, replay, continuity, recovery modules

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

- session/schema/
- session/store/
- session/transcript/
- session/lifecycle/ only if a narrow state transition owner is needed

This route should normally create or extend:

- packages/ts-shell/src/session/schema/sessionRecord.ts
- packages/ts-shell/src/session/schema/sessionMessage.ts
- packages/ts-shell/src/session/schema/sessionStateSnapshot.ts
- packages/ts-shell/src/session/schema/sessionMetadataCodec.ts
- packages/ts-shell/src/session/store/sessionFileStore.ts
- packages/ts-shell/src/session/store/sessionFileLayout.ts
- packages/ts-shell/src/session/store/sessionStore.ts
- packages/ts-shell/src/session/store/sessionStateStore.ts
- packages/ts-shell/src/session/store/sessionListStore.ts if list store code is touched
- packages/ts-shell/src/session/store/currentSessionRegistry.ts
- packages/ts-shell/src/session/transcript/sessionTranscript.ts

If files already exist, integrate into them instead of duplicating.

## Goal

Extract durable session storage, schema, transcript, and current-session registry implementation out of SessionManager.ts while preserving public API compatibility.

SessionManager should keep:

- public class export
- constructor compatibility
- public method names
- type re-exports for existing callers
- high-level delegation

SessionManager should stop deeply owning:

- low-level JSON read/write retry
- atomic writes
- file locks
- path projection
- metadata/state schema codec
- transcript append/read implementation
- current-session registry read/write implementation
- load/write substrate details

## Required Scope

Complete all of the following unless safety blocks:

1. Schema/type extraction.
2. File store and layout extraction.
3. State store and atomic/locking extraction.
4. Transcript append/read extraction.
5. Current-session registry extraction.
6. Session create/load/delete/rename delegation.

If a category cannot be safely moved, stop and report PARTIAL. Do not hide by only doing easy schema movement.

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

## Checkpoint B: Schema And Type Boundary

Move durable schema definitions and codecs into schema-owned modules.

Candidates:

- SessionMessage
- Session
- SessionMetadata
- SessionStateSnapshot
- TerminalPersistence if touched
- buildSessionStateSnapshot if safe
- projectSessionMetadata/write metadata codec if safe

Must preserve:

- metadata.json shape
- state.json shape
- transcript event compatibility
- existing public type imports through SessionManager re-exports
- no session schema migration

Do not rename fields.

## Checkpoint C: Store, Layout, Atomic IO, And Locking

Move file layout, durable JSON IO, atomic write, retry, and lock implementation into store-owned modules.

Candidates:

- ensureSessionsDir
- generateSessionId
- getSessionDir/path helpers
- readJsonFileWithRetry
- writeJsonFileAtomic
- withSessionStateLock
- withFileLock
- sleepBlocking
- isTransientLockError
- isTransientIoError
- readStateSnapshotSafely
- readStateSnapshotRequired
- writeSessionState

Must preserve:

- directory substrate
- lock behavior
- retry behavior
- corrupt file guidance
- unreadable session isolation
- no transcript or state loss

## Checkpoint D: Transcript Store

Move transcript append/read implementation into transcript owner.

Candidates:

- getTranscriptEvents
- appendTranscriptEvent
- addTurn internals
- transcript path integration with store layout

Must preserve:

- transcript.jsonl append order
- transcript encoding/decoding behavior
- message projection
- addTurn write-through behavior

Do not change replay normalization in this route.

## Checkpoint E: Current-Session Registry

Move current-session registry implementation into store/current-session owner.

Candidates:

- normalizeProjectRootKey
- readCurrentSessionStore
- writeCurrentSessionStore
- removeCurrentSessionSelection
- resolveCurrentSessionForProject internals
- setCurrentSessionForProject internals
- clearCurrentSessionForProject internals

Must preserve:

- current session selection behavior
- stale selection cleanup
- project root key normalization
- cross-manager current selection visibility

## Checkpoint F: Facade Delegation And Store Operations

Make SessionManager delegate create/load/delete/rename/sessionExists/path methods to owners where safe.

Candidates:

- writeSession
- writeSessionMetadata
- load
- createNewWithId internals
- createNew internals
- renameSession internals
- deleteSession internals
- sessionExists internals
- getSessionFilePath/getSessionDirPath internals

Must preserve:

- public API
- old path accessors
- workspace binding metadata
- current lifecycle defaults
- session title behavior

## Strict Non-Goals

Do not extract recovery snapshot or replay read model.

Do not extract pending lifecycle reconciliation.

Do not extract buildContinuitySnapshot.

Do not extract approval memory.

Do not extract request-scope facts.

Do not extract CLI/reentry presentation.

Do not change session schema.

Do not run live provider.

Do not change product behavior.

Do not weaken result/evidence truthfulness.

Do not move route docs/reports/package scripts.

Do not edit CLI or runtime behavior except import updates required by moved types.

Do not mass-format unrelated files.

## Compatibility

Keep current public imports working from SessionManager.ts.

If types move, re-export them from SessionManager.ts.

Existing callers must not need source changes unless import cycles force narrow internal updates inside session modules.

No session schema migration.

## Validation

Required after schema/store/transcript extraction:

- npm test -w packages/ts-shell -- src/session/SessionManager.test.ts
- npm test -w packages/ts-shell -- src/session/sessionManagerBoundary.test.ts
- focused tests for new schema/store/transcript/current registry modules
- npm run build -w packages/ts-shell
- import scan for session modules importing SessionManager.ts when they should import schema/store owners
- product/runtime import scan for docs/scripts/dev-history leakage
- git diff --check
- git status --short --branch

Suggested focused SessionManager cases:

- directory substrate
- metadata/state/transcript load and write
- current-session selection
- workspace binding
- addTurn and transcript append
- corrupt state handling
- unreadable directory warning
- current-session restore
- rename/delete/sessionExists/path accessors

Run result-contract and Route221 gate only if terminal/result truth fields are touched. They should not be touched in this route.

Do not run live provider.

## Completion Criteria

COMPLETE requires:

- ownership table completed before edits
- schema/type boundary extracted with compatibility re-exports
- store/layout/atomic IO/locking extracted
- transcript append/read extracted
- current-session registry extracted
- create/load/delete/rename/sessionExists/path methods delegate to owners where safe
- SessionManager.ts visibly smaller and remains compatibility facade
- no generic helper/sessionUtils bucket movement
- no session schema drift
- transcript append/read ordering preserved
- focused tests and build pass
- remaining SessionManager responsibilities listed

PARTIAL if:

- only schema/types move
- only docs/comments change
- session schema compatibility is uncertain
- focused tests fail
- import cycles cannot be resolved safely

BLOCKED if:

- extraction requires session schema migration
- transcript compatibility cannot be preserved
- public API compatibility cannot be preserved

## Serena Policy

Use Serena if available for symbol overview, references, call graph, and ownership clustering.

Do not use Serena as validation replacement.

If onboarding asks for memory writes and memory updates are not needed, skip onboarding and continue.

## Commit

Commit green checkpoint if useful.

Suggested prefix:

phase3-session-route1:

Do not push.

## Final Report

Include:

1. Final status
2. Ownership audit summary
3. Schema files moved/created
4. Store files moved/created
5. Transcript files moved/created
6. Current-session registry files moved/created
7. Compatibility strategy
8. Product behavior changed yes/no
9. Session schema impact
10. Transcript ordering impact
11. Validation results
12. Serena usage
13. Remaining SessionManager responsibilities
14. SessionManager line count
15. Commit hash if committed
16. Whether safe to start next session route
