# Stay Vs Move

| Symbol/region | Stay? | Move? | Split? | Delete/deprecate later? | Final destination | Reason |
|---|---:|---:|---:|---:|---|---|
| `SessionManager` class export | Yes | No | Yes | No | `SessionManager.ts` facade | Public callers depend on this facade. |
| Public session/schema type re-exports | Yes | Yes | No | No | `session/schema/sessionRecord.ts`, `session/schema/sessionMessage.ts` | Move definitions but preserve import compatibility. |
| Constructor/store layout fields | Yes | Later | Yes | No | `session/store/sessionStore.ts` | Facade should construct store dependencies. |
| Path helpers | Temporary | Yes | No | No | `session/store/sessionFileLayout.ts` | Store should own file layout. |
| `getSessionFilePath`, `getSessionDirPath` | Yes | No | No | Maybe | Facade compatibility | Public compatibility accessors. |
| `sessionExists` | Temporary | Yes | No | No | `session/store/sessionStore.ts` | Store query. |
| Current-session selection methods | Temporary | Yes | Yes | No | `session/store/currentSessionRegistry.ts` | Registry owns current selection and stale cleanup. |
| `createNewWithId`, `createNew` | Yes | Partly | Yes | No | Facade plus `session/store/sessionStore.ts` | Keep public API; move record construction/storage. |
| `resume` | Yes | Partly | Yes | No | `session/recovery/sessionResume.ts` | Public API stays; recovery transition should be owned. |
| `tryResume` | Temporary | Yes | No | No | `session/recovery/sessionResume.ts` | Trust-boundary and hint generation are recovery owner. |
| `addTurn` | Temporary | Yes | No | No | `session/transcript/sessionTranscript.ts` | Transcript append/write-through owner. |
| `recordApprovalAuditDecision` | Temporary | Yes | No | No | `session/approval/sessionApprovalMemory.ts` | Approval memory persistence is not core manager logic. |
| Lifecycle methods | Temporary | Yes | Yes | No | `session/lifecycle/sessionLifecycleStore.ts`, `session/lifecycle/sessionTerminalStore.ts` | State transitions are session-owned but should be isolated. |
| `renameSession`, `deleteSession` | Temporary | Yes | No | No | `session/store/sessionStore.ts` | Store operations. |
| `reconcilePendingLifecycle` | No | Yes | No | No | `session/recovery/sessionLifecycleReconciliation.ts` | Recovery lifecycle repair is too specific for the facade. |
| `appendQueryEvent` | Temporary | Yes | Yes | No | `session/transcript/sessionQueryEventPersistence.ts` | Split append from state read-model update. |
| `isDuplicateDurableResolutionEvent` | No | Yes | No | No | `session/recovery/sessionLifecycleReadModel.ts` | Lifecycle read-model concern. |
| `getTranscriptEvents` | Temporary | Yes | No | No | `session/transcript/sessionTranscript.ts` | Transcript store read. |
| `getRecoverySnapshot` | Temporary | Yes | Yes | No | `session/recovery/sessionRecoverySnapshot.ts` | Recovery read model should own state/transcript merge. |
| `deriveLifecycleIndexFromTranscript` | No | Yes | No | No | `session/recovery/sessionLifecycleReadModel.ts` | Transcript truth read model. |
| Replay wrappers | Yes | Partly | No | No | `session/replay/sessionReplayFacade.ts` | Keep public API, move owner. |
| Runtime seed wrapper | Yes | Partly | No | No | `session/replay/sessionRuntimeSeed.ts` | Runtime seed construction is replay/runtime bridge. |
| `listSessions` | Temporary | Yes | Yes | No | `session/store/sessionListStore.ts`, `session/presentation/sessionWarningSurface.ts` | Load/sort/warn should not be all in facade. |
| Reentry/project context listing | Temporary | Yes | Yes | No | `session/recovery/sessionRecoverySelection.ts`, `session/presentation/sessionReentrySurface.ts` | Summary and selection owners. |
| Workspace binding update | Temporary | Yes | Yes | No | `session/store/sessionProjectBinding.ts` | Store binding owner. |
| Project-root rebind with working-memory rebase | No | Yes | Yes | No | `session/store/sessionProjectBinding.ts`, `session/continuation/sessionRootRebase.ts` | Metadata mutation and continuity rebase should separate. |
| `buildContinuitySnapshot` | No | Yes | Yes | No | `session/continuation/sessionContinuitySnapshot.ts`, `result/sessionResultTruthAdapter.ts`, `session/approval/sessionApprovalContinuity.ts` | Largest monolithic domain region. |
| Prompt continuity wrappers | Yes | Partly | No | No | `session/continuation/sessionPromptContinuity.ts` | Facade API stays; builder moves. |
| Legacy permission normalization | Temporary | Yes | No | Later | `session/continuation/legacyPermissionRebase.ts` | Old-session compatibility, not facade core. |
| Legacy memory extraction helpers | No | Yes | No | Later | `session/continuation/legacyContinuityMemory.ts` | Deprecated residue should be isolated before removal. |
| Recovery trust boundary methods | No | Yes | Yes | No | `session/recovery/sessionResumeEligibility.ts`, `session/recovery/recoveryTrustBoundary.ts` | Recovery domain owner. |
| `writeSession`, `load`, state and metadata IO | Temporary | Yes | Yes | No | `session/store/sessionStore.ts`, `session/schema/sessionRecordCodec.ts` | Store/schema owner. |
| Locking, retry, atomic JSON IO | No | Yes | No | No | `session/store/sessionFileStore.ts` | Durable file-store primitive. |
| `buildSessionStateSnapshot` | Temporary | Yes | Yes | No | `session/schema/sessionStateSnapshot.ts` | Schema projection with durable-status dependency. |

## What Should Stay In The Facade

- Public construction and API compatibility.
- Session id creation entrypoint.
- High-level create/resume/lifecycle methods that delegate to owners.
- Current-session convenience methods while entrypoints still call them.
- Public replay, runtime seed, continuity, and reentry methods as wrappers until
  consumers migrate.
- Compatibility re-exports for types currently imported from `SessionManager.ts`.

## What Should Move First

1. File store, metadata/state codec, transcript store, and current session
   registry.
2. Replay and recovery snapshot/read-model construction.
3. Continuity snapshot and legacy working-memory parsing.
4. Approval memory and permission/request-scope continuity.
5. Presentation/reentry surfaces.

## What Should Not Be Deleted Yet

- Legacy permission normalization.
- Legacy continuity memory summary parsing.
- Existing public methods used by shell recovery, CLI modules, and tests.
- Terminal/durable status fields in `state.json`.
- Transcript repair behavior used to replay older or interrupted sessions.
