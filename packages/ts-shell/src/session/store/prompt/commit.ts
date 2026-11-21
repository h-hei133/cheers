import fs from 'node:fs';
import { hashContent, pathIdentity } from '../../../core/workspace/files.js';
import { persistSessionUsage } from '../../../observability/usageTelemetry.js';
import { prepareSessionUserPromptBarrier } from '../../lifecycle/sessionPromptBarrier.js';
import type { SessionSettlement } from '../../lifecycle/sessionTerminalStore.js';
import type { ImageContent } from '../../../model-adapters/multimodal.js';
import type { QueryEvent } from '../../../core/query/runtime/events.js';
import type { Session } from '../../schema/sessionRecord.js';
import type { SessionStateSnapshotOverrides } from '../../schema/sessionStateSnapshot.js';
import { projectSessionMetadata } from '../../schema/sessionMetadataCodec.js';
import { buildSessionStateSnapshot } from '../../schema/sessionStateSnapshot.js';
import { createQueryTranscriptEvent, encodeTranscriptEvent, type TranscriptEvent } from '../../sessionEventCodec.js';
import { captureTranscriptAppend, reconcileTranscriptAppend } from '../../transcript/append.js';
import { writeTextFileAtomic } from '../sessionFileStore.js';
import type { SessionFileLayout } from '../sessionFileLayout.js';
import { withSessionStateLock } from '../sessionStateStore.js';
import { readSessionRecordSnapshot } from '../sessionStore.js';
import { readSessionFileVersion } from '../version.js';
import { syncStoreDirectory } from '../directory.js';
import { settleResumeReceipt } from '../currentSessionRegistry.js';
import { finishActivationMetadata } from './activation.js';
import { assertNoPromptIntent, encodePromptIntent, hasPromptIntent, identifyPromptFile, promptFileText,
  PromptPublicationError, promptIntentPath, readPromptIntent, type PromptIntent } from './intent.js';

const lock = { requireExisting: true, allowPromptIntent: true, recovery: 'local-dead' } as const;

/** Reserve and publish only the accepted user prompt. This path never dispatches a model. */
export function commitSessionPrompt(layout: SessionFileLayout, sessionId: string, input: {
  readonly prompt: string;
  readonly metadata?: Record<string, unknown>;
  readonly images?: readonly ImageContent[];
  readonly admission?: () => void;
}): void {
  commitPromptTransaction(layout, sessionId, 1, (session, timestamp) =>
    prepareSessionUserPromptBarrier({ ...input, session, timestamp }), input.admission);
}

export type SettlementDiagnostic = {
  readonly event: Extract<QueryEvent, { type: 'lifecycle.cancelled' | 'lifecycle.error' }>;
  readonly sourceEntryId?: string;
};

export function commitSessionSettlement(
  layout: SessionFileLayout, sessionId: string,
  prepare: (session: Session, timestamp: string) => SessionSettlement,
  diagnostic?: SettlementDiagnostic,
): void {
  commitPromptTransaction(layout, sessionId, 2, (session, timestamp) => {
    const settlement = prepare(session, timestamp);
    const events: TranscriptEvent[] = diagnostic
      ? [createQueryTranscriptEvent({ ...diagnostic, sourceEntryId: diagnostic.sourceEntryId ?? '', timestamp }), settlement.event]
      : [settlement.event];
    return { ...settlement, events };
  });
}

/** Commit any multi-file turn, lifecycle, or workspace-binding update through the single transaction journal. */
export function commitSessionRecordTransaction(
  layout: SessionFileLayout, sessionId: string,
  prepare: (session: Session, timestamp: string) => {
    readonly session: Session;
    readonly events?: readonly TranscriptEvent[];
    readonly overrides?: SessionStateSnapshotOverrides;
  },
  admission?: () => void,
): Session {
  return commitPromptTransaction(layout, sessionId, 3, (session, timestamp) => {
    const prepared = prepare(session, timestamp);
    return { session: prepared.session, events: prepared.events ?? [], overrides: prepared.overrides ?? {} };
  }, admission);
}

function commitPromptTransaction(
  layout: SessionFileLayout, sessionId: string, journalVersion: PromptIntent['version'],
  prepare: (session: Session, timestamp: string) => {
    session: Session; events: readonly TranscriptEvent[]; overrides: SessionStateSnapshotOverrides;
  },
  admission?: () => void,
): Session {
  const kind = journalVersion === 1 ? 'prompt' : journalVersion === 2 ? 'outcome' : 'record';
  let attempted = false;
  let persisted = false;
  let cleanupFailed = false;
  try {
    return withSessionStateLock(layout, () => {
      assertNoPromptIntent(layout);
      const directory = pathIdentity(layout.sessionDir);
      const version = readSessionFileVersion(layout);
      const metadataBefore = hashContent(promptFileText(layout.metadataPath, 'metadata'));
      const stateBefore = hashContent(promptFileText(layout.statePath, 'state'));
      const current = readSessionRecordSnapshot({ layout, sessionId, cwd: process.cwd() });
      if (current.session.id !== sessionId || current.transcriptTruncated || current.warnings.length) throw new PromptPublicationError('unchanged', kind);
      const transcript = captureTranscriptAppend(layout.transcriptPath);
      const prepared = prepare(current.session, new Date().toISOString());
      const rows = prepared.events.length ? `${prepared.events.map(encodeTranscriptEvent).join('\n')}\n` : '';
      const metadata = JSON.stringify(projectSessionMetadata(prepared.session), null, 2);
      const snapshot = buildSessionStateSnapshot(prepared.session, current.state, prepared.overrides);
      persistSessionUsage(sessionId, current.state.usage, usage => {
        const intent: PromptIntent = { version: journalVersion, sessionId, directory, transcript, rows,
          metadata: { before: metadataBefore, after: metadata },
          state: { before: stateBefore, after: JSON.stringify({ ...snapshot, usage }, null, 2) } };
        const encoded = encodePromptIntent(intent);
        writeTextFileAtomic(promptIntentPath(layout), encoded, 0o600, {
          createParent: false,
          beforeRename: () => {
            admission?.();
            assertNoPromptIntent(layout);
            if (pathIdentity(layout.sessionDir) !== directory || readSessionFileVersion(layout) !== version) throw new PromptPublicationError('unchanged', kind);
          },
          onRenameStart: () => { attempted = true; },
        });
        syncSessionDirectory(layout, directory);
        try { finishSessionPrompt(layout, intent, () => { persisted = true; }); }
        catch (error) {
          // The usage writer can adopt a verified snapshot even if journal cleanup failed.
          if (!persisted) throw error;
          cleanupFailed = true;
        }
      });
      if (cleanupFailed) throw new PromptPublicationError('persisted', kind);
      return prepared.session;
    }, lock);
  } catch (error) {
    if (!attempted && error instanceof PromptPublicationError && error.persistence === 'unknown') throw error;
    throw new PromptPublicationError(persisted ? 'persisted' : attempted ? 'unknown' : 'unchanged', kind);
  }
}

/** Reopen the existing session under its lock and reconcile only the recorded intent. */
export function recoverSessionPrompt(layout: SessionFileLayout, sessionId: string, registryPath: string, beforeReplay?: () => void): void {
  if (!beforeReplay && !hasPromptIntent(layout)) return;
  try {
    withSessionStateLock(layout, () => {
      beforeReplay?.();
      const intent = readPromptIntent(layout, sessionId);
      if (intent?.version === 4 || intent?.version === 5) {
        settleResumeReceipt(registryPath, intent, committed => finishActivationMetadata(layout, intent, committed));
      } else if (intent) finishSessionPrompt(layout, intent);
      else if (beforeReplay) throw new PromptPublicationError('unknown');
    }, lock);
  } catch { throw new PromptPublicationError('unknown'); }
}

function finishSessionPrompt(layout: SessionFileLayout, intent: PromptIntent, onPersisted?: () => void): void {
  const marker = promptIntentPath(layout);
  const markerIdentity = pathIdentity(marker);
  const check = () => {
    if (pathIdentity(layout.sessionDir) !== intent.directory || pathIdentity(marker) !== markerIdentity) throw new PromptPublicationError('unknown');
  };
  check();
  const metadata = identifyPromptFile(layout.metadataPath, 'metadata', intent.metadata);
  const state = identifyPromptFile(layout.statePath, 'state', intent.state);
  if ((metadata === 'after' || state === 'after') && !reconcileTranscriptAppend(layout.transcriptPath, intent.transcript, intent.rows, false)) {
    throw new PromptPublicationError('unknown');
  }
  reconcileTranscriptAppend(layout.transcriptPath, intent.transcript, intent.rows);
  if (metadata === 'before') writeTextFileAtomic(layout.metadataPath, intent.metadata.after, undefined, {
    createParent: false,
    beforeRename: () => { check(); identifyPromptFile(layout.metadataPath, 'metadata', intent.metadata); },
  });
  if (state === 'before') writeTextFileAtomic(layout.statePath, intent.state.after, undefined, {
    createParent: false,
    beforeRename: () => { check(); identifyPromptFile(layout.statePath, 'state', intent.state); },
  });
  check();
  if (identifyPromptFile(layout.metadataPath, 'metadata', intent.metadata) === 'before'
    || identifyPromptFile(layout.statePath, 'state', intent.state) === 'before'
    || !reconcileTranscriptAppend(layout.transcriptPath, intent.transcript, intent.rows, false)) throw new PromptPublicationError('unknown');
  syncSessionDirectory(layout, intent.directory);
  check();
  onPersisted?.();
  fs.unlinkSync(marker);
  syncSessionDirectory(layout, intent.directory);
}

function syncSessionDirectory(layout: SessionFileLayout, directory: string): void {
  syncStoreDirectory(layout.sessionDir, directory);
}
