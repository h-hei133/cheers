# Ownership Audit

Classification legend:

- Valid session ownership: should remain in `SessionManager` or a direct
  session-owned storage/schema module.
- Domain logic in wrong owner: belongs outside `SessionManager` and should not
  be deeply owned by the facade.
- Compatibility glue: can remain temporarily to preserve callers and old
  records.
- Temporary adapter: acceptable bridge until callers migrate.
- Extraction candidate: should move to a named owner module.
- Deprecated/legacy residue: compatibility path that should be retired only
  after old-session evidence shows it is unused or migrated.

## Header And Imports

| Symbol/region | Responsibility | Classification | Final owner | Action |
|---|---|---|---|---|
| File header layout comment | Documents directory substrate. | Valid session ownership | `session/store` | Keep, eventually move to store/schema docs. |
| `fs`, `path` imports | File system persistence and locking. | Valid session ownership | `session/store` | Split behind store/transcript modules. |
| Query/runtime imports | Query events, recovery boundaries, runtime seed. | Compatibility glue | `session/replay`, `session/recovery`, `runtime` | Keep facade imports until replay/recovery ports exist. |
| Tool lifecycle import | Pending approval/tool lifecycle index. | Extraction candidate | `session/recovery/sessionLifecycleReadModel.ts` | Move read-model mutation and reconciliation. |
| Orchestration type imports | Terminal and coding result shapes. | Domain logic in wrong owner | `result`, `session/continuation` | Isolate through continuation/result adapters. |
| Session module imports | Projection, codec, registry, replay, continuity modules. | Compatibility glue | Existing named session modules | Keep imports while facade delegates. |

## Types And Interfaces

| Symbol/region | Responsibility | Classification | Final owner | Action |
|---|---|---|---|---|
| `SessionMessage` | User/assistant message shape. | Valid session ownership | `session/schema/sessionMessage.ts` | Move later with re-export from facade. |
| `Session` | Public durable session identity and status. | Valid session ownership | `session/schema/sessionRecord.ts` | Move later with re-export from facade. |
| `SessionReentrySummary` | Presentation/recovery summary. | Extraction candidate | `session/presentation/sessionReentrySurface.ts` or `session/recovery/sessionReentrySummary.ts` | Re-export for callers. |
| `ProjectContextSummary` | Recent workspace/session aggregate. | Extraction candidate | `session/recovery/projectContextSummary.ts` | Re-export for CLI workspace surface. |
| `SessionMetadata` | On-disk metadata shape. | Valid session ownership | `session/schema/sessionMetadata.ts` | Move with metadata codec. |
| `SessionStateSnapshot` | On-disk mutable state shape. | Valid session ownership with embedded cross-domain fields | `session/schema/sessionStateSnapshot.ts` | Split schema from projections. |
| `TranscriptRepairContext` | Replay repair context. | Extraction candidate | `session/replay/sessionReplayRepair.ts` | Move with replay preparation. |
| `RecoverySnapshot` | Recovery read model combining state and transcript. | Extraction candidate | `session/recovery/sessionRecoverySnapshot.ts` | Re-export from facade. |
| `TerminalPersistence` | Minimal terminal fields persisted to state. | Compatibility glue | `session/schema/sessionTerminalPersistence.ts` | Keep stable, move type. |
| `ReplayPlan` | Replayable transcript/runtime prompt projection. | Extraction candidate | `session/replay/sessionReplayPlan.ts` | Re-export from facade. |
| `ResumeResult`, `ResumeOptions` | Resume facade result. | Compatibility glue | `session/recovery/sessionResume.ts` | Re-export from facade. |
| `RecoveryTrustBoundaryBlock` | Trust-boundary block projection. | Extraction candidate | `session/recovery/recoveryTrustBoundary.ts` | Re-export from facade. |
| `SessionResumeEligibility` | Recovery eligibility classification. | Extraction candidate | `session/recovery/sessionResumeEligibility.ts` | Re-export from facade. |

## Constructor, Constants, And Store Layout

| Symbol/region | Responsibility | Classification | Final owner | Action |
|---|---|---|---|---|
| `STATE_IO_MAX_ATTEMPTS`, retry constants | Store durability behavior. | Valid session ownership | `session/store/sessionFileStore.ts` | Move with file IO implementation. |
| `STATE_LOCK_*` constants | State lock durability behavior. | Valid session ownership | `session/store/sessionStateStore.ts` | Move with state store. |
| `AUTO_COMPACT_TURN_THRESHOLD` | Long-session continuity retention threshold. | Extraction candidate | `session/summary/sessionCompactRetention.ts` | Move with compaction retention. |
| `APPROVAL_AUDIT_HISTORY_LIMIT` | Approval history retention. | Extraction candidate | `session/approval/sessionApprovalMemory.ts` | Move with approval memory. |
| `storeLayout`, `sessionsDir`, `currentSessionStorePath` | Session store layout. | Valid session ownership | `session/store/sessionStore.ts` | Keep facade fields until store injected. |
| warning state fields | Read/list warning suppression. | Valid session ownership | `session/store/sessionListStore.ts` | Move with list/load store. |
| `constructor` | Creates layout and ensures store. | Valid session ownership | `SessionManager` facade | Keep, later construct store dependencies. |

## Path And Identity Helpers

| Symbol/region | Responsibility | Classification | Final owner | Action |
|---|---|---|---|---|
| `ensureSessionsDir` | Creates store directories. | Valid session ownership | `session/store/sessionStore.ts` | Move behind store. |
| `generateSessionId` | Creates session id. | Valid session ownership | `session/store/sessionId.ts` | Keep delegated. |
| `getSessionDir`, `getMetadataPath`, `getTranscriptPath`, `getStatePath`, `getStateLockPath` | Projects paths. | Valid session ownership | `session/store/sessionFileLayout.ts` | Keep as private facade wrappers or move. |
| `getSessionFilePath`, `getSessionDirPath` | Compatibility path accessors. | Compatibility glue | `SessionManager` facade | Keep public until callers migrate. |
| `sessionExists` | Existence check. | Valid session ownership | `session/store/sessionStore.ts` | Move behind store. |

## Current Session Selection

| Symbol/region | Responsibility | Classification | Final owner | Action |
|---|---|---|---|---|
| `getCurrentSessionForProject` | Legacy nullable current-session lookup. | Compatibility glue | `SessionManager` facade | Keep wrapper over selection service. |
| `resolveCurrentSessionForProject` | Current-session lookup, stale selection cleanup, load failure handling. | Extraction candidate | `session/store/currentSessionRegistry.ts` | Move orchestration into registry service; facade loads via store. |
| `setCurrentSessionForProject` | Persist current selection. | Valid session ownership | `session/store/currentSessionRegistry.ts` | Move behind registry. |
| `clearCurrentSessionForProject` | Clear current selection. | Valid session ownership | `session/store/currentSessionRegistry.ts` | Move behind registry. |
| `normalizeProjectRootKey`, `readCurrentSessionStore`, `writeCurrentSessionStore`, `removeCurrentSessionSelection` | Registry codec and mutation. | Valid session ownership | `session/store/currentSessionRegistry.ts` | Move fully. |

## Creation, Resume, And Lifecycle

| Symbol/region | Responsibility | Classification | Final owner | Action |
|---|---|---|---|---|
| `createNewWithId`, `createNew` | Create durable session record, bind project, set current. | Valid session ownership | `SessionManager` facade + `session/store/sessionStore.ts` | Keep facade; move record construction to schema/store. |
| `resume` | Load, mark active, set current. | Valid session ownership with compatibility behavior | `session/recovery/sessionResume.ts` | Split state transition from facade. |
| `tryResume` | Resume with recovery trust-boundary check and user hint. | Extraction candidate | `session/recovery/sessionResume.ts` | Move eligibility and result construction. |
| `addTurn` | Append message and persist metadata/state. | Valid session ownership | `session/transcript/sessionTranscript.ts` | Move append/read write-through. |
| `markRunStarted` | Mark active run and reset terminal/pending lifecycle. | Valid session ownership | `session/lifecycle/sessionLifecycleStore.ts` | Move with lifecycle state transitions. |
| `persistUserPromptBarrier` | Persist user prompt before query events. | Valid session ownership | `session/lifecycle/sessionPromptBarrier.ts` | Keep behavior, extract carefully. |
| `markTurnActive` | Turn-active lifecycle transition. | Valid session ownership | `session/lifecycle/sessionLifecycleStore.ts` | Move with lifecycle transitions. |
| `markRecoveryReentry` | Map runtime recovery boundary to lifecycle state. | Extraction candidate | `session/recovery/sessionRecoveryLifecycle.ts` | Move recovery-specific transition. |
| `saveInterrupted` | Persist interrupted terminal lifecycle. | Valid session ownership | `session/lifecycle/sessionLifecycleStore.ts` | Move with terminal persistence. |
| `saveCompleted` | Persist completed state and success terminal default. | Valid session ownership with result-truth risk | `session/lifecycle/sessionTerminalStore.ts` | Move only with result contract tests. |
| `saveError` | Persist error/stopped state, lastError truth, terminal fields. | Valid session ownership with result-truth risk | `session/lifecycle/sessionTerminalStore.ts` | Move only with truthfulness tests. |
| `saveTerminated` | Persist terminated state. | Valid session ownership | `session/lifecycle/sessionLifecycleStore.ts` | Move with lifecycle. |
| `renameSession`, `deleteSession` | Metadata title and directory deletion. | Valid session ownership | `session/store/sessionStore.ts` | Move behind store. |

## Approval Memory

| Symbol/region | Responsibility | Classification | Final owner | Action |
|---|---|---|---|---|
| `recordApprovalAuditDecision` | Persist approval audit decision into working memory. | Extraction candidate | `session/approval/sessionApprovalMemory.ts` | Move behind approval memory adapter; keep facade method. |
| `decodeApprovalMemory`, `decodeApprovalMemoryHistory` usage | Read approval memory from working memory. | Extraction candidate | `session/approval/sessionApprovalMemory.ts` | Move read projection out of continuity builder. |
| Approval provenance projection in `buildContinuitySnapshot` | Project last approval provenance into continuity. | Extraction candidate | `session/approval/sessionApprovalContinuity.ts` | Preserve as session fact, not authority. |

## Transcript And Pending Lifecycle

| Symbol/region | Responsibility | Classification | Final owner | Action |
|---|---|---|---|---|
| `appendQueryEvent` | Append query event and apply state read model. | Valid session ownership with lifecycle extraction | `session/transcript/sessionTranscript.ts` and `session/recovery/sessionLifecycleReadModel.ts` | Split append from lifecycle index update. |
| `isDuplicateDurableResolutionEvent` | Dedupe direct resolution events. | Extraction candidate | `session/recovery/sessionLifecycleReadModel.ts` | Move with pending lifecycle read model. |
| `reconcilePendingLifecycle` | Compensate pending approvals/tools. | Extraction candidate | `session/recovery/sessionLifecycleReconciliation.ts` | Move; preserve no false success. |
| `findCompensatedLifecycleEvent` | Find existing direct resolution. | Extraction candidate | `session/recovery/sessionLifecycleReadModel.ts` | Move with reconciliation. |
| `applyQueryEventToState` | Apply lifecycle index and compaction retention. | Extraction candidate | `session/transcript/sessionQueryEventPersistence.ts` | Split lifecycle update and compaction. |
| `deriveLifecycleIndexFromTranscript` | Rebuild lifecycle index from transcript truth. | Extraction candidate | `session/recovery/sessionLifecycleReadModel.ts` | Move; keep transcript truth priority. |
| `getTranscriptEvents` | Read and decode transcript file. | Valid session ownership | `session/transcript/sessionTranscript.ts` | Move behind transcript store. |
| `appendTranscriptEvent` | Append encoded event. | Valid session ownership | `session/transcript/sessionTranscript.ts` | Move behind transcript store. |

## Recovery Snapshot, Replay, And Runtime Seed

| Symbol/region | Responsibility | Classification | Final owner | Action |
|---|---|---|---|---|
| `getRecoverySnapshot` | Combine loaded session, state, repaired transcript, last messages, lifecycle read model. | Extraction candidate | `session/recovery/sessionRecoverySnapshot.ts` | Move after transcript store is stable. |
| `normalizeTranscriptEvents` | Compatibility wrapper over replay normalization. | Compatibility glue | `session/replay/sessionReplayBuilder.ts` | Keep facade wrapper until callers migrate. |
| `repairTranscriptEvents` | Compatibility wrapper over replay repair. | Compatibility glue | `session/replay/sessionReplayRepair.ts` | Keep wrapper. |
| `prepareReplayTranscript` | Private replay repair delegate. | Compatibility glue | `session/replay/sessionReplayRepair.ts` | Remove after snapshot extraction. |
| `getReplayPlan` | Build replay plan from recovery snapshot. | Extraction candidate | `session/replay/sessionReplayFacade.ts` | Keep public facade method. |
| `buildRuntimeStateSeed` | Build runtime seed from recovery snapshot. | Extraction candidate | `session/replay/sessionRuntimeSeed.ts` | Keep public facade method for shell recovery. |

## Listing, Reentry, And Recovery Selection

| Symbol/region | Responsibility | Classification | Final owner | Action |
|---|---|---|---|---|
| `listSessions` | Load and sort sessions, suppress unreadable warnings. | Valid session ownership with console leakage | `session/store/sessionListStore.ts` and `session/presentation/sessionWarnings.ts` | Move store logic; keep warning policy explicit. |
| `listRecentSessions` | Slice recent sessions. | Valid session ownership | `SessionManager` facade or store query | Keep or move with list store. |
| `listRecentProjectContexts` | Aggregate summaries per project. | Extraction candidate | `session/recovery/projectContextSummary.ts` | Move aggregation owner. |
| `listReentrySummaries` | Build and sort reentry summaries. | Extraction candidate | `session/recovery/sessionRecoverySelection.ts` | Move orchestration over summary builder. |
| `getSuggestedRecoverySession` | Select best recoverable session. | Extraction candidate | `session/recovery/sessionRecoverySelection.ts` | Move selection orchestration. |
| `getRecoveryTrustBoundaryBlock` | Select first trust-boundary block. | Extraction candidate | `session/recovery/recoveryTrustBoundary.ts` | Move with recovery selection. |
| `describeSessionReentry` | Build presentation/recovery summary from snapshots. | Extraction candidate | `session/presentation/sessionReentrySurface.ts` | Keep facade method, move projection. |
| `getSessionResumeEligibility` | Facade over trust-boundary evaluation. | Compatibility glue | `session/recovery/sessionResumeEligibility.ts` | Keep wrapper. |

## Workspace Binding And Rebase

| Symbol/region | Responsibility | Classification | Final owner | Action |
|---|---|---|---|---|
| `rebindSessionProjectRoot` | Change project root and rebase working-memory anchors. | Extraction candidate | `session/store/sessionProjectBinding.ts` and `session/continuation/sessionRootRebase.ts` | Split metadata binding from continuity rebase. |
| `updateSessionWorkspaceBinding` | Update root mode, requested root, target base, git root. | Valid session ownership | `session/store/sessionProjectBinding.ts` | Move behind store. |
| `normalizeLegacyPermissionStateForSession` | Rewrite legacy permission working memory on snapshot build. | Deprecated/legacy residue and extraction candidate | `session/continuation/legacyPermissionRebase.ts` | Keep until migration/removal route. |

## Continuity Snapshot

| Symbol/region | Responsibility | Classification | Final owner | Action |
|---|---|---|---|---|
| `buildContinuitySnapshot` lines 1275-1709 | Huge continuity projection from transcript, coding result, result truth, approval memory, write continuity, read fragments, repair, verification, provenance, task satisfaction. | Domain logic in wrong owner and extraction candidate | `session/continuation/sessionContinuitySnapshot.ts` plus `result` and `evidence` adapters | Highest-value extraction after store/replay stabilization. |
| Last terminal source selection | Avoids success upgrade when query success wraps coding non-success. | Domain logic in wrong owner but safety-critical | `result/sessionResultTruthAdapter.ts` | Extract only with truthfulness gates. |
| Unresolved item construction | Turns result/verification/repair state into continuation facts. | Extraction candidate | `session/continuation/sessionUnresolvedItems.ts` | Move with snapshot builder. |
| Mutation continuity projection | Recent changed/target/failed/verified file state. | Extraction candidate | `session/continuation/sessionMutationContinuity.ts` | Existing `mutationContinuityState.ts` can own more. |
| Read window/fragment fields | Read-continuation facts. | Extraction candidate | `session/continuation/sessionReadContinuity.ts` | Move with read continuity owner. |
| Approval memory/provenance fields | Approval continuity, not authority. | Extraction candidate | `session/approval/sessionApprovalContinuity.ts` | Move with approval memory. |
| Tool execution provenance fields | Tool provenance continuity. | Extraction candidate | `session/continuation/sessionToolContinuity.ts` | Move without changing authority semantics. |

## Prompt Continuity

| Symbol/region | Responsibility | Classification | Final owner | Action |
|---|---|---|---|---|
| `buildPromptContinuityContext` | Format snapshot into prompt context. | Extraction candidate | `session/continuation/sessionPromptContinuity.ts` | Keep facade wrapper. |
| `buildPromptContinuitySnapshot` | Project follow-up snapshot. | Extraction candidate | `session/continuation/sessionPromptContinuity.ts` | Keep facade wrapper. |

## Working-Memory Extraction Helpers

| Symbol/region | Responsibility | Classification | Final owner | Action |
|---|---|---|---|---|
| `extractActionHandoffSummaryFromMemory` | Parse old summary/continuity keys. | Deprecated/legacy residue and extraction candidate | `session/continuation/legacyContinuityMemory.ts` | Move; delete only after migration evidence. |
| `extractWriteContinuityFromMemory` | Parse write continuity from old memory. | Deprecated/legacy residue and extraction candidate | `session/continuation/legacyContinuityMemory.ts` | Move; preserve no-write truth. |
| `extractSeedInfluenceHandoffSummaryFromMemory` | Parse seed influence handoff. | Deprecated/legacy residue and extraction candidate | `session/continuation/legacyContinuityMemory.ts` | Move. |
| `extractFailureHandoffDiagnosticFromMemory` | Parse failure handoff diagnostic. | Deprecated/legacy residue and extraction candidate | `session/continuation/legacyContinuityMemory.ts` | Move. |
| `extractSuccessHandoffDiagnosticFromMemory` | Parse success handoff diagnostic. | Deprecated/legacy residue and extraction candidate | `session/continuation/legacyContinuityMemory.ts` | Move. |
| `extractSeedInfluenceFromQueryResult` | Derive seed influence from result evidence strings. | Domain logic in wrong owner | `evidence/sessionSeedInfluence.ts` or `session/continuation/sessionSeedInfluence.ts` | Extract with evidence tests. |
| `extractSeedInfluenceFromMemory` | Parse seed influence from memory. | Deprecated/legacy residue and extraction candidate | `session/continuation/legacyContinuityMemory.ts` | Move. |

## Recovery Trust Boundary

| Symbol/region | Responsibility | Classification | Final owner | Action |
|---|---|---|---|---|
| `evaluateRecoveryTrustBoundary` | Classifies recoverable/interrupted/error sessions based on deterministic terminal and continuation evidence. | Extraction candidate | `session/recovery/sessionResumeEligibility.ts` | Move with focused tests. |
| `hasResumeContextEvidence` | Recovery evidence fallback. | Extraction candidate | `session/recovery/sessionResumeEvidence.ts` | Move with eligibility. |
| `createRecoveryTrustBoundaryBlock` | Produce trust-boundary block with session dir and reason. | Extraction candidate | `session/recovery/recoveryTrustBoundary.ts` | Move projection. |

## Persistence IO

| Symbol/region | Responsibility | Classification | Final owner | Action |
|---|---|---|---|---|
| `writeSession` | Create substrate and write metadata/state. | Valid session ownership | `session/store/sessionStore.ts` | Move store implementation. |
| `writeSessionMetadata` | Metadata codec write. | Valid session ownership | `session/schema/sessionMetadataCodec.ts` | Move with codec. |
| `writeSessionState` | Locked state merge/write. | Valid session ownership | `session/store/sessionStateStore.ts` | Move with state store. |
| `load` | Load metadata, state, transcript-derived turns, project binding fallback. | Valid session ownership and extraction candidate | `session/store/sessionStore.ts` and `session/schema/sessionRecordCodec.ts` | Move after schema facade exists. |
| `readStateSnapshotSafely`, `readStateSnapshotRequired` | State reads. | Valid session ownership | `session/store/sessionStateStore.ts` | Move. |
| `readJsonFileWithRetry` | Low-level durable JSON read. | Valid session ownership | `session/store/sessionFileStore.ts` | Move. |
| `buildSessionStateSnapshot` | State snapshot projection and durable status. | Valid session ownership with result-truth dependency | `session/schema/sessionStateSnapshot.ts` | Move carefully, preserve durable status. |
| `withSessionStateLock`, `withFileLock`, `sleepBlocking`, `isTransientLockError`, `isTransientIoError`, `writeJsonFileAtomic` | File locking and atomic write implementation. | Valid session ownership | `session/store/sessionFileStore.ts` | Move first or with store extraction. |

## Overall Classification

`SessionManager.ts` is not an unacceptable monolith because many domain rules
already have named modules and the class mostly coordinates persistence and
facade methods. It is still a partial monolith because the largest behavioral
surface, `buildContinuitySnapshot`, plus recovery trust evaluation, replay seed
assembly, pending lifecycle reconciliation, approval memory persistence, and
legacy working-memory parsing remain deeply owned by the class.
