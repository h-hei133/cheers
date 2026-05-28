# Current Map

## File Size

- Source: `packages/ts-shell/src/session/SessionManager.ts`.
- Current size: 2581 lines.
- Test file: `packages/ts-shell/src/session/SessionManager.test.ts`.
- Test size: 3876 lines.
- Route document: `docs/product_architecture_reset_routes/phase3-session-manager-audit.md`.

## Current Role

`SessionManager.ts` is the public compatibility facade for session identity,
session lifecycle, durable session records, transcript access, recovery,
continuity, replay, and CLI/session summary surfaces.

It already delegates meaningful logic to focused modules:

- `sessionStore.ts`: session layout, id creation, path projection, id validation.
- `sessionRegistry.ts` and `currentSessionSelection.ts`: current-session store
  projection and selection decisions.
- `sessionEventCodec.ts`: transcript event encoding, decoding, and message
  projection.
- `sessionReplayBuilder.ts`: transcript normalization, replay plan, runtime seed.
- `sessionRecoverySelection.ts`: recent context aggregation and recovery
  candidate ordering.
- `sessionSummaryProjection.ts`: reentry summary and trust-boundary block
  projection.
- `sessionResumeContextBuilder.ts`: prompt continuity context and snapshot
  projection.
- `sessionContinuityModule.ts`, `sessionContinuationProjection.ts`,
  `mutationContinuityState.ts`, `approvalMemoryCodec.ts`,
  `permissionRequestMemoryCodec.ts`, and `projectRootRebaseProjection.ts`:
  continuity extraction and compatibility parsing.

The remaining problem is not that the file lacks modules. The problem is that
the facade still owns the orchestration of too many product domains directly.

## Imports By Owner

Valid session infrastructure imports:

- Node `fs` and `path`.
- `sessionStore.ts`, `sessionRegistry.ts`, `currentSessionSelection.ts`.
- `sessionEventCodec.ts`, `sessionMetadataProjection.ts`,
  `projectBindingPolicy.ts`.

Session-owned but extractable imports:

- `sessionReplayBuilder.ts`, `sessionRecoverySelection.ts`,
  `sessionSummaryProjection.ts`, `sessionResumeContextBuilder.ts`,
  `sessionContinuationProjection.ts`, `sessionCompactModule.ts`,
  `sessionApprovalMemoryModule.ts`, `sessionContinuityModule.ts`,
  `sessionContinuityTypes.ts`.

Cross-domain imports that make the facade heavy:

- `../core/query/events.js` and `../core/query/runtimeState.js` for query event
  and recovery seed shapes.
- `../core/tools/toolResultLifecycle.js` for pending lifecycle truth.
- `../orchestration/types.js` for terminal classification, terminal reasons,
  coding result summaries, write effects, and continuation reasons.

Those cross-domain imports may remain at the facade during compatibility, but
the long-term owner should isolate them behind session replay, continuation,
recovery, approval, and result-facing adapters.

## Exports

Re-exported types:

- `CurrentSessionSelectionResolution`.
- `ApprovalAuditMemoryState`.
- `SessionContinuitySnapshot`.
- `TranscriptEvent`.
- `WorkspaceRootMode`.

Public interfaces:

- `SessionMessage`.
- `Session`.
- `SessionReentrySummary`.
- `ProjectContextSummary`.
- `RecoverySnapshot`.
- `ReplayPlan`.
- `ResumeResult`.
- `ResumeOptions`.
- `RecoveryTrustBoundaryBlock`.
- `SessionResumeEligibility`.

Internal interfaces:

- `SessionMetadata`.
- `SessionStateSnapshot`.
- `TranscriptRepairContext`.
- `TerminalPersistence`.

Main public class:

- `SessionManager`.

## Public Methods

Session identity, paths, and existence:

- `getSessionFilePath`.
- `getSessionDirPath`.
- `sessionExists`.

Current session selection:

- `getCurrentSessionForProject`.
- `resolveCurrentSessionForProject`.
- `setCurrentSessionForProject`.
- `clearCurrentSessionForProject`.

Creation, loading, resume, and lifecycle:

- `createNewWithId`.
- `createNew`.
- `resume`.
- `tryResume`.
- `addTurn`.
- `markRunStarted`.
- `persistUserPromptBarrier`.
- `markTurnActive`.
- `markRecoveryReentry`.
- `saveInterrupted`.
- `saveCompleted`.
- `saveError`.
- `saveTerminated`.
- `renameSession`.
- `deleteSession`.

Approval/session memory:

- `recordApprovalAuditDecision`.

Transcript and query events:

- `reconcilePendingLifecycle`.
- `appendQueryEvent`.
- `getTranscriptEvents`.
- `normalizeTranscriptEvents`.
- `repairTranscriptEvents`.

Recovery, replay, and runtime seed:

- `getRecoverySnapshot`.
- `getReplayPlan`.
- `buildRuntimeStateSeed`.
- `getRecoveryTrustBoundaryBlock`.
- `describeSessionReentry`.
- `getSessionResumeEligibility`.
- `buildContinuitySnapshot`.
- `buildPromptContinuityContext`.
- `buildPromptContinuitySnapshot`.

Listing and workspace binding:

- `listSessions`.
- `listRecentSessions`.
- `listRecentProjectContexts`.
- `listReentrySummaries`.
- `getSuggestedRecoverySession`.
- `rebindSessionProjectRoot`.
- `updateSessionWorkspaceBinding`.

## Major Private Regions

Storage and path substrate:

- `ensureSessionsDir`.
- `generateSessionId`.
- `getSessionDir`.
- `getMetadataPath`.
- `getTranscriptPath`.
- `getStatePath`.
- `getStateLockPath`.
- `writeSession`.
- `writeSessionMetadata`.
- `writeSessionState`.
- `load`.
- `readStateSnapshotSafely`.
- `readStateSnapshotRequired`.
- `readJsonFileWithRetry`.
- `writeJsonFileAtomic`.
- `withSessionStateLock`.
- `withFileLock`.
- `sleepBlocking`.
- `isTransientLockError`.
- `isTransientIoError`.

Current-session registry:

- `normalizeProjectRootKey`.
- `readCurrentSessionStore`.
- `writeCurrentSessionStore`.
- `removeCurrentSessionSelection`.

Replay and lifecycle read model:

- `deriveLifecycleIndexFromTranscript`.
- `prepareReplayTranscript`.
- `findCompensatedLifecycleEvent`.
- `isDuplicateDurableResolutionEvent`.
- `applyQueryEventToState`.

Continuity and working-memory compatibility:

- `normalizeLegacyPermissionStateForSession`.
- `applyAutoCompactRetention`.
- `extractSeedInfluenceFromQueryResult`.
- `extractSeedInfluenceFromMemory`.
- `extractActionHandoffSummaryFromMemory`.
- `extractWriteContinuityFromMemory`.
- `extractSeedInfluenceHandoffSummaryFromMemory`.
- `extractFailureHandoffDiagnosticFromMemory`.
- `extractSuccessHandoffDiagnosticFromMemory`.

Recovery eligibility:

- `evaluateRecoveryTrustBoundary`.
- `hasResumeContextEvidence`.
- `createRecoveryTrustBoundaryBlock`.

## Storage Paths

Per-session directory layout, as documented in the file header:

- `metadata.json`: identity, project root binding, timestamps, title.
- `transcript.jsonl`: append-only message, lifecycle, and query events.
- `state.json`: mutable session state snapshot and working memory.
- `state.lock`: lock file used for state writes.

Global current selection:

- `currentSessionStorePath` from `createSessionStoreLayout()`.

## Schema Touchpoints

Metadata schema:

- `SessionMetadata`.
- `projectSessionMetadata(session)`.
- `writeSessionMetadata`.
- `load`.

State schema:

- `SessionStateSnapshot`.
- `buildSessionStateSnapshot`.
- `writeSessionState`.
- `readStateSnapshotRequired`.
- `readStateSnapshotSafely`.

Transcript schema:

- `TranscriptEvent`.
- `encodeTranscriptEvent`.
- `decodeTranscriptLine`.
- `transcriptEventToSessionMessage`.
- `createMessageTranscriptEvent`.
- `createLifecycleTranscriptEvent`.
- `createQueryTranscriptEvent`.

Compatibility schema:

- Legacy permission working memory normalization.
- Approval memory and approval history decoding.
- Request-scope and permission-request memory decoding.
- Auto-compact continuity retention.
- Rebase projection for old project-root residues.

## Tests

`SessionManager.test.ts` covers these major contracts:

- interrupted session restore and pending prompt metadata.
- workspace root mode and requested workspace metadata.
- workspace binding updates.
- runtime seed construction after tryResume.
- corrupt file recovery guidance.
- project-root rebind and continuity anchor rebase.
- unreadable session directory isolation.
- directory substrate shape.
- legacy permission memory normalization.
- approval and task truth anchors in continuity snapshots.
- approval memory retention through auto-compact.
- recovery suggestion filtering for interrupted, error, stopped, and
  indeterminate sessions.
- richer transcript events and recovery snapshots.
- reentry summary ranking and project context aggregation.
- current-session selection across manager instances.
- terminal evidence restoration.
- long-session compact continuity fixtures.
- replay plan construction and replay repair.
- terminal classification persistence.
- lastError preservation only for true durable errors.
- runtime state seed boundaries.
- pending lifecycle tracking, reconciliation, and idempotency.
- direct-resolution dedupe.
- stopped failure details, approval provenance, tool provenance, and transform
  evidence in continuity snapshots.

Adjacent tests:

- `sessionManagerBoundary.test.ts`.
- `sessionReplayBuilder.test.ts`.
- `sessionRecoverySelection.test.ts`.
- `sessionPresentationFacts.test.ts`.
- `continuationEvidenceParity.test.ts`.
- `longSessionDurability.test.ts`.
- `mutationCompactContinuity.test.ts`.
- projection/codec tests under `packages/ts-shell/src/session/`.
- shell recovery and session runtime tests under `packages/ts-shell/src/core/shell/`.

## Consumers

Production consumers include:

- `entrypoints/cli.tsx`: constructs `SessionManager`, recovery candidate
  lookup, approval audit recording.
- `entrypoints/cliRuntimeModule.ts`: accepts `SessionManager` and
  `SessionContinuitySnapshot`.
- `entrypoints/cliSessionModule.ts`: session commands, switch, reentry summary.
- `entrypoints/cliWorkspaceModule.ts`: workspace/session attach and creation.
- `entrypoints/sessionsPanel.ts`: rename, delete, resume cue.
- `entrypoints/handleSigint.ts`: signal-time lifecycle update.
- `core/shell/bootstrap.ts`: startup resume and rebind.
- `core/shell/sessionRuntime.ts`: query event persistence and terminal saves.
- `core/shell/recovery.ts`: resume, recovery snapshot, runtime seed, prompt.
- `core/shell/continueShellActionRuntime.ts`: resume-like shell actions.
- `core/shell/sessionStateSurface.ts`: current/switched session surfaces.
- `core/shell/startupSurfaceRenderer.ts`: startup session summary surface.
- `core/shell/sessionTerminalState.ts`: continuity state typing.
- Session modules that still import types from `SessionManager.ts`.

This consumer map explains why `SessionManager` must remain a compatibility
facade during extraction.
