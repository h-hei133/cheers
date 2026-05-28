# Extraction Targets

These targets are grouped into implementation routes. The groups are aggressive
enough to reduce real monolith pressure, but avoid combining schema migration
with truth, presentation, or approval authority changes.

## Route 1: Store, Schema, Transcript Boundary

Purpose: make `SessionManager` a facade over named durable storage owners
without changing runtime behavior or session schema.

Targets:

- Source symbols/regions:
  - `SessionMessage`, `Session`, `SessionMetadata`, `SessionStateSnapshot`.
  - `ensureSessionsDir`, `generateSessionId`, path helpers.
  - `writeSession`, `writeSessionMetadata`, `writeSessionState`, `load`.
  - `readStateSnapshotSafely`, `readStateSnapshotRequired`.
  - `readJsonFileWithRetry`, `writeJsonFileAtomic`.
  - `withSessionStateLock`, `withFileLock`, `sleepBlocking`,
    `isTransientLockError`, `isTransientIoError`.
  - `getTranscriptEvents`, `appendTranscriptEvent`, `addTurn`.
  - current-session store wrappers.
- Destination files:
  - `packages/ts-shell/src/session/schema/sessionRecord.ts`.
  - `packages/ts-shell/src/session/schema/sessionMessage.ts`.
  - `packages/ts-shell/src/session/schema/sessionStateSnapshot.ts`.
  - `packages/ts-shell/src/session/schema/sessionMetadataCodec.ts`.
  - `packages/ts-shell/src/session/store/sessionFileStore.ts`.
  - `packages/ts-shell/src/session/store/sessionStore.ts`.
  - `packages/ts-shell/src/session/store/sessionStateStore.ts`.
  - `packages/ts-shell/src/session/store/currentSessionRegistry.ts`.
  - `packages/ts-shell/src/session/transcript/sessionTranscript.ts`.
- Compatibility strategy:
  - Keep all current `SessionManager` public methods and type re-exports.
  - Move implementations behind internal store objects or pure functions.
  - Preserve local TypeScript imports with `.js` extensions.
  - Keep on-disk `metadata.json`, `transcript.jsonl`, and `state.json` shape
    byte-compatible except for timestamp differences that already exist.
- Tests:
  - Focused `SessionManager.test.ts` cases for directory substrate, current
    selection, workspace metadata, addTurn, corrupt state handling, unreadable
    directory warnings, and current-session restore.
  - `currentSessionSelection.test.ts`, `sessionRegistry` coverage if present or
    added.
  - `sessionManagerBoundary.test.ts`.
  - Build only if TypeScript code changes.
- Stop conditions:
  - Any session schema shape change is required.
  - Any caller migration requires CLI behavior changes.
  - Transcript append ordering changes.
  - Locking behavior cannot be preserved with focused tests.

## Route 2: Replay, Recovery Snapshot, And Pending Lifecycle Read Model

Purpose: move recovery/replay read-model construction out of the manager while
preserving transcript truth and no-false-success boundaries.

Targets:

- Source symbols/regions:
  - `RecoverySnapshot`, `ReplayPlan`, `TranscriptRepairContext`.
  - `getRecoverySnapshot`.
  - `deriveLifecycleIndexFromTranscript`.
  - `normalizeTranscriptEvents`, `repairTranscriptEvents`,
    `prepareReplayTranscript`.
  - `getReplayPlan`, `buildRuntimeStateSeed`.
  - `appendQueryEvent`, `applyQueryEventToState`.
  - `isDuplicateDurableResolutionEvent`.
  - `findCompensatedLifecycleEvent`.
  - `reconcilePendingLifecycle`.
- Destination files:
  - `packages/ts-shell/src/session/recovery/sessionRecoverySnapshot.ts`.
  - `packages/ts-shell/src/session/recovery/sessionLifecycleReadModel.ts`.
  - `packages/ts-shell/src/session/recovery/sessionLifecycleReconciliation.ts`.
  - `packages/ts-shell/src/session/replay/sessionReplayFacade.ts`.
  - `packages/ts-shell/src/session/replay/sessionRuntimeSeed.ts`.
  - `packages/ts-shell/src/session/transcript/sessionQueryEventPersistence.ts`.
- Compatibility strategy:
  - `SessionManager.getRecoverySnapshot`, `getReplayPlan`,
    `buildRuntimeStateSeed`, `reconcilePendingLifecycle`, and
    `appendQueryEvent` remain stable facade methods.
  - New modules accept store/transcript adapters instead of importing the
    manager.
  - Pending lifecycle must be derived from transcript truth, not stale state,
    matching current tests.
- Tests:
  - `SessionManager.test.ts` replay/runtime seed/pending lifecycle/dedupe cases.
  - `sessionReplayBuilder.test.ts`.
  - Shell recovery tests that capture runtime seed and pending lifecycle repair.
  - Result contract and Route221 gate only if terminal truth fields are touched.
- Stop conditions:
  - Reconciliation would append synthetic cleanup when direct resolution exists.
  - Runtime seed recovery boundary changes.
  - Replay repair becomes non-idempotent.
  - Stopped/error/success terminal classification changes.

## Route 3: Continuity Snapshot And Legacy Working-Memory Compatibility

Purpose: move the 400+ line continuity projection and old working-memory parsing
into named continuation owners.

Targets:

- Source symbols/regions:
  - `buildContinuitySnapshot`.
  - `normalizeLegacyPermissionStateForSession`.
  - `applyAutoCompactRetention`.
  - `extractActionHandoffSummaryFromMemory`.
  - `extractWriteContinuityFromMemory`.
  - `extractSeedInfluenceFromMemory`.
  - `extractSeedInfluenceFromQueryResult`.
  - `extractSeedInfluenceHandoffSummaryFromMemory`.
  - `extractFailureHandoffDiagnosticFromMemory`.
  - `extractSuccessHandoffDiagnosticFromMemory`.
  - unresolved item construction inside the continuity snapshot.
  - read-window, read-fragment, staged repair, answer defect, mutation
    continuity, and provenance projections.
- Destination files:
  - `packages/ts-shell/src/session/continuation/sessionContinuitySnapshot.ts`.
  - `packages/ts-shell/src/session/continuation/sessionPromptContinuity.ts`.
  - `packages/ts-shell/src/session/continuation/sessionUnresolvedItems.ts`.
  - `packages/ts-shell/src/session/continuation/sessionReadContinuity.ts`.
  - `packages/ts-shell/src/session/continuation/sessionMutationContinuity.ts`.
  - `packages/ts-shell/src/session/continuation/legacyContinuityMemory.ts`.
  - `packages/ts-shell/src/session/continuation/legacyPermissionRebase.ts`.
  - `packages/ts-shell/src/session/continuation/sessionSeedInfluence.ts`.
  - `packages/ts-shell/src/result/sessionResultTruthAdapter.ts`.
- Compatibility strategy:
  - Keep `SessionManager.buildContinuitySnapshot`,
    `buildPromptContinuityContext`, and `buildPromptContinuitySnapshot`.
  - Do not change `SessionContinuitySnapshot` fields.
  - Preserve legacy summary key parsing until a separate deprecation route has
    evidence that old session records no longer need it.
  - Preserve current terminal-source rule that prevents query-level success from
    upgrading coding-level non-success.
- Tests:
  - All `SessionManager.test.ts` continuity cases from legacy permissions
    through transform evidence.
  - `mutationCompactContinuity.test.ts`.
  - `longSessionDurability.test.ts`.
  - `continuationEvidenceParity.test.ts`.
  - `sessionCompactModule.test.ts`, `compactContinuitySummary.test.ts`,
    `approvalMemoryCodec.test.ts`, `permissionRequestMemoryCodec.test.ts`.
  - Result contract and Route221 anti-false-success gate if terminal or
    evidence truth projection changes.
- Stop conditions:
  - Any not-proven, partial, blocked, skipped, not-run, stopped, or error state
    becomes success-like.
  - Legacy old-session permission facts are lost or rewritten incorrectly.
  - Redaction or real-provider path hiding weakens.
  - The route requires deleting old compatibility parsing.

## Route 4: Approval Memory And Request-Scope Facts

Purpose: isolate approval memory as session facts and prevent it from becoming
authorization authority.

Targets:

- Source symbols/regions:
  - `recordApprovalAuditDecision`.
  - approval history retention constant.
  - approval memory decode/history reads in `buildContinuitySnapshot`.
  - permission request/request-scope evidence and memory resolution.
  - approval provenance continuity fields.
- Destination files:
  - `packages/ts-shell/src/session/approval/sessionApprovalMemory.ts`.
  - `packages/ts-shell/src/session/approval/sessionApprovalContinuity.ts`.
  - `packages/ts-shell/src/session/approval/sessionRequestScopeMemory.ts`.
- Compatibility strategy:
  - Keep facade method `recordApprovalAuditDecision`.
  - Keep memory as historical session facts only.
  - Do not infer write or execution authority from approval memory.
  - Preserve history limit behavior.
- Tests:
  - Approval memory and permission request cases in `SessionManager.test.ts`.
  - `approvalMemoryCodec.test.ts`.
  - `approvalAuditProjection.test.ts`.
  - Permission/write-gate tests if any downstream policy consumes the facts.
- Stop conditions:
  - Approval memory starts authorizing writes/commands.
  - Cache-key/project-root normalization regresses.
  - Old approval history disappears across compaction.

## Route 5: Recovery Selection And Reentry Presentation

Purpose: separate session recovery selection from CLI/session presentation
without changing terminal output.

Targets:

- Source symbols/regions:
  - `SessionReentrySummary`, `ProjectContextSummary`.
  - `listRecentProjectContexts`, `listReentrySummaries`.
  - `getSuggestedRecoverySession`.
  - `getRecoveryTrustBoundaryBlock`.
  - `describeSessionReentry`.
  - `getSessionResumeEligibility`.
  - `evaluateRecoveryTrustBoundary`.
  - `hasResumeContextEvidence`.
  - `createRecoveryTrustBoundaryBlock`.
  - warning output in `listSessions`.
- Destination files:
  - `packages/ts-shell/src/session/recovery/sessionResumeEligibility.ts`.
  - `packages/ts-shell/src/session/recovery/recoveryTrustBoundary.ts`.
  - `packages/ts-shell/src/session/recovery/sessionRecoverySelection.ts`.
  - `packages/ts-shell/src/session/recovery/projectContextSummary.ts`.
  - `packages/ts-shell/src/session/presentation/sessionReentrySurface.ts`.
  - `packages/ts-shell/src/session/presentation/sessionWarningSurface.ts`.
- Compatibility strategy:
  - Keep facade methods and type exports.
  - Preserve CLI-facing strings unless the implementation route explicitly owns
    presentation updates.
  - Keep recovery ranking and preferred-project behavior stable.
- Tests:
  - `sessionRecoverySelection.test.ts`.
  - Reentry and project context cases in `SessionManager.test.ts`.
  - Shell recovery tests.
  - CLI/session surface tests if rendered text changes.
- Stop conditions:
  - Recovery candidate ordering changes unexpectedly.
  - Interrupted/error/stopped eligibility semantics change.
  - Terminal evidence indeterminate sessions become resumable.
  - CLI output formatting changes outside route scope.

## Route 6: Dead Residue And Compatibility Cleanup

Purpose: remove or deprecate compatibility residue only after extraction routes
have stable ownership and tests prove old-session behavior.

Targets:

- Source symbols/regions:
  - Legacy summary-string parsing helpers.
  - Legacy permission root rebase compatibility.
  - Facade methods that no production caller uses after migration.
  - Type re-exports no longer used outside `session/`.
- Destination files:
  - No helper bucket. Use existing owner modules and delete only from the
    facade after callers migrate.
- Compatibility strategy:
  - First add deprecation notes or tests proving no production caller.
  - Delete in a route separate from behavior extraction.
- Tests:
  - Import scan for `SessionManager` type exports.
  - Old-session fixture tests.
  - `SessionManager.test.ts` compatibility subset.
- Stop conditions:
  - Any deletion would strand old session records.
  - Any deletion requires session schema migration.
  - Caller migration crosses CLI/runtime/schema boundaries in one patch.
