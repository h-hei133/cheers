# Phase 3 SessionManager Route 2: Replay, Recovery Snapshot, And Pending Lifecycle Read Model

## Purpose

Continue reducing:

packages/ts-shell/src/session/SessionManager.ts

Route 1 extracted store, schema, transcript, and current-session registry owners.

Route 2 extracts replay, recovery snapshot, runtime seed, pending lifecycle read model, query event persistence, and pending lifecycle reconciliation.

This route is implementation work, not another audit.

It must preserve transcript truth, replay parity, runtime recovery seed behavior, pending lifecycle reconciliation, and no-false-success boundaries.

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
- Route 1 store/schema/transcript modules and tests
- existing sessionReplayBuilder.ts
- existing recovery and shell recovery tests

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
- session/replay/
- session/transcript/
- session/lifecycle/ if a narrow lifecycle owner is needed
- session/schema/ only for stable type reuse
- runtime/ only for runtime-facing contracts, not session read model

Expected destinations, subject to inspection:

- packages/ts-shell/src/session/recovery/sessionRecoverySnapshot.ts
- packages/ts-shell/src/session/recovery/sessionLifecycleReadModel.ts
- packages/ts-shell/src/session/recovery/sessionLifecycleReconciliation.ts
- packages/ts-shell/src/session/replay/sessionReplayFacade.ts
- packages/ts-shell/src/session/replay/sessionRuntimeSeed.ts
- packages/ts-shell/src/session/transcript/sessionQueryEventPersistence.ts

If files already exist, integrate into them instead of duplicating.

## Goal

Make SessionManager a compatibility facade over recovery/replay/lifecycle owners.

SessionManager should keep public facade methods:

- getRecoverySnapshot
- getReplayPlan
- buildRuntimeStateSeed
- reconcilePendingLifecycle
- appendQueryEvent
- normalizeTranscriptEvents
- repairTranscriptEvents

But it should stop deeply owning:

- recovery snapshot assembly
- transcript lifecycle read model
- pending lifecycle reconciliation
- direct-resolution dedupe
- replay repair preparation
- replay plan construction
- runtime seed construction
- query event state read-model update

## Required Scope

Complete all categories unless safety blocks:

1. Recovery snapshot extraction.
2. Lifecycle index/read-model extraction.
3. Pending lifecycle reconciliation extraction.
4. Replay facade/runtime seed extraction.
5. Query event persistence extraction.

If a category cannot be safely moved, stop and report PARTIAL. Do not hide by doing only easy replay wrappers.

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

## Checkpoint B: Recovery Snapshot And Lifecycle Read Model

Move recovery snapshot construction and transcript-derived lifecycle read model into recovery owners.

Candidates:

- RecoverySnapshot type if still local
- getRecoverySnapshot internals
- deriveLifecycleIndexFromTranscript
- isDuplicateDurableResolutionEvent
- findCompensatedLifecycleEvent if read-model-owned
- transcript truth merge for recovery snapshot
- terminal persistence read model used by recovery snapshot

Must preserve:

- transcript truth priority
- terminal persistence behavior
- direct-resolution dedupe
- stopped/error/completed distinctions
- recovery snapshot fields
- corrupt/unreadable session behavior
- no-false-success terminal truth

## Checkpoint C: Pending Lifecycle Reconciliation And Query Event Persistence

Move query event persistence and pending lifecycle reconciliation into transcript/recovery owners.

Candidates:

- appendQueryEvent internals
- applyQueryEventToState
- reconcilePendingLifecycle internals
- findCompensatedLifecycleEvent if reconciliation-owned

Must preserve:

- append order
- state update behavior
- pending lifecycle compensation behavior
- direct-resolution idempotency
- no duplicate durable resolution
- transcript-derived truth over stale state
- no success upgrade from cleanup events

## Checkpoint D: Replay Facade And Runtime Seed

Move replay plan and runtime state seed construction into replay owners.

Candidates:

- TranscriptRepairContext type if still local
- ReplayPlan type if still local
- normalizeTranscriptEvents wrapper internals
- repairTranscriptEvents wrapper internals
- prepareReplayTranscript
- getReplayPlan internals
- buildRuntimeStateSeed internals

Must preserve:

- replay normalization parity
- replay repair idempotency
- sentinel behavior
- runtime recovery seed shape
- prompt continuity and recovery boundary behavior
- existing facade methods and return types

## Strict Non-Goals

Do not extract buildContinuitySnapshot.

Do not extract approval memory.

Do not extract request-scope facts.

Do not extract CLI/reentry presentation.

Do not change session schema.

Do not change transcript event codec behavior.

Do not change product behavior.

Do not run live provider.

Do not move route docs/reports/package scripts.

Do not change result/evidence terminal truth.

Do not turn stopped/blocked/partial/skipped/not-run/no-provider/not-proven into success.

Do not edit CLI or runtime behavior except import/type updates required by moved session modules.

Do not mass-format unrelated files.

## Compatibility

Keep current public imports and methods working from SessionManager.ts.

If types move, re-export them from SessionManager.ts.

New modules must accept store/transcript/session adapters or plain records. They must not import SessionManager.ts.

Avoid import cycles between session/recovery, session/replay, session/transcript, and SessionManager.ts.

## Validation

Required after Checkpoint B/C/D and final:

- npm test -w packages/ts-shell -- src/session/SessionManager.test.ts
- npm test -w packages/ts-shell -- src/session/sessionReplayBuilder.test.ts
- focused tests for new recovery/replay/query-event modules
- npm test -w packages/ts-shell -- src/core/shell/recovery.test.ts src/core/shell/recovery.read-model-priority.test.ts src/core/shell/recovery.repeated-handoff-cleanup.test.ts src/core/shell/recovery.repeated-handoff-direct-resolution.test.ts src/core/shell/recovery.terminal-boundary.test.ts
- npm run build -w packages/ts-shell
- import scan for new session modules importing SessionManager.ts
- product/runtime import scan for docs/scripts/dev-history leakage
- git diff --check
- git status --short --branch

Run npm run verify:result-contract and npm run verify:route221-anti-false-success-gate if terminal/result truth fields are touched or if any recovery/replay change could affect success/stopped/partial/not-proven surfaces.

Do not run live provider.

## Completion Criteria

COMPLETE requires:

- ownership table completed before edits
- recovery snapshot extracted
- lifecycle read model extracted
- pending lifecycle reconciliation extracted
- query event persistence extracted
- replay facade/runtime seed extracted
- SessionManager.ts visibly smaller and delegates these responsibilities
- no generic helper/sessionUtils bucket movement
- public facade methods preserved
- transcript truth and replay parity preserved
- no pending lifecycle or false-success drift
- focused tests and build pass
- remaining SessionManager responsibilities listed

PARTIAL if:

- only replay wrappers move
- recovery snapshot remains deeply owned by SessionManager
- pending lifecycle reconciliation remains deeply owned by SessionManager
- focused tests fail
- behavior compatibility is uncertain

BLOCKED if:

- extraction requires session schema migration
- transcript truth cannot be preserved
- import cycles cannot be avoided
- terminal truth would weaken

## Serena Policy

Use Serena if available for symbol overview, references, call graph, and ownership clustering.

Do not use Serena as validation replacement.

If onboarding asks for memory writes and memory updates are not needed, skip onboarding and continue.

## Commit

Commit green checkpoint if useful.

Suggested prefix:

phase3-session-route2:

Do not push.

## Final Report

Include:

1. Final status
2. Ownership audit summary
3. Recovery files moved/created
4. Replay files moved/created
5. Query/lifecycle files moved/created
6. Compatibility strategy
7. Product behavior changed yes/no
8. Session schema impact
9. Transcript/replay truth impact
10. Pending lifecycle impact
11. Validation results
12. Serena usage
13. Remaining SessionManager responsibilities
14. SessionManager line count
15. Commit hash if committed
16. Whether safe to start next session route
