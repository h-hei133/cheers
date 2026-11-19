import fs from 'node:fs';
import { hashContent, pathIdentity } from '../../../core/workspace/files.js';
import { persistSessionUsage } from '../../../observability/usageTelemetry.js';
import { prepareSessionUserPromptBarrier } from '../../lifecycle/sessionPromptBarrier.js';
import type { ImageContent } from '../../../model-adapters/multimodal.js';
import { projectSessionMetadata } from '../../schema/sessionMetadataCodec.js';
import { buildSessionStateSnapshot } from '../../schema/sessionStateSnapshot.js';
import { encodeTranscriptEvent } from '../../sessionEventCodec.js';
import { captureTranscriptAppend, reconcileTranscriptAppend } from '../../transcript/append.js';
import { writeTextFileAtomic } from '../sessionFileStore.js';
import type { SessionFileLayout } from '../sessionFileLayout.js';
import { withSessionStateLock } from '../sessionStateStore.js';
import { readSessionRecordSnapshot } from '../sessionStore.js';
import { readSessionFileVersion } from '../version.js';
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
  let attempted = false;
  let persisted = false;
  let cleanupFailed = false;
  try {
    withSessionStateLock(layout, () => {
      assertNoPromptIntent(layout);
      const directory = pathIdentity(layout.sessionDir);
      const version = readSessionFileVersion(layout);
      const metadataBefore = hashContent(promptFileText(layout.metadataPath, 'metadata'));
      const stateBefore = hashContent(promptFileText(layout.statePath, 'state'));
      const current = readSessionRecordSnapshot({ layout, sessionId, cwd: process.cwd() });
      if (current.session.id !== sessionId || current.transcriptTruncated || current.warnings.length) throw new PromptPublicationError('unchanged');
      const transcript = captureTranscriptAppend(layout.transcriptPath);
      const prepared = prepareSessionUserPromptBarrier({ ...input, session: current.session, timestamp: new Date().toISOString() });
      const rows = `${prepared.events.map(encodeTranscriptEvent).join('\n')}\n`;
      const metadata = JSON.stringify(projectSessionMetadata(prepared.session), null, 2);
      const snapshot = buildSessionStateSnapshot(prepared.session, current.state, prepared.overrides);
      persistSessionUsage(sessionId, current.state.usage, usage => {
        const intent: PromptIntent = { version: 1, sessionId, directory, transcript, rows,
          metadata: { before: metadataBefore, after: metadata },
          state: { before: stateBefore, after: JSON.stringify({ ...snapshot, usage }, null, 2) } };
        const encoded = encodePromptIntent(intent);
        writeTextFileAtomic(promptIntentPath(layout), encoded, 0o600, {
          createParent: false,
          beforeRename: () => {
            input.admission?.();
            assertNoPromptIntent(layout);
            if (pathIdentity(layout.sessionDir) !== directory || readSessionFileVersion(layout) !== version) throw new PromptPublicationError('unchanged');
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
      if (cleanupFailed) throw new PromptPublicationError('persisted');
    }, lock);
  } catch (error) {
    if (!attempted && error instanceof PromptPublicationError) throw error;
    throw new PromptPublicationError(persisted ? 'persisted' : attempted ? 'unknown' : 'unchanged');
  }
}

/** Reopen the existing session under its lock and reconcile only the recorded intent. */
export function recoverSessionPrompt(layout: SessionFileLayout, sessionId: string): void {
  if (!hasPromptIntent(layout)) return;
  try {
    withSessionStateLock(layout, () => {
      const intent = readPromptIntent(layout, sessionId);
      if (intent) finishSessionPrompt(layout, intent);
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
  if (identifyPromptFile(layout.metadataPath, 'metadata', intent.metadata) !== 'after'
    || identifyPromptFile(layout.statePath, 'state', intent.state) !== 'after'
    || !reconcileTranscriptAppend(layout.transcriptPath, intent.transcript, intent.rows, false)) throw new PromptPublicationError('unknown');
  syncSessionDirectory(layout, intent.directory);
  check();
  onPersisted?.();
  fs.unlinkSync(marker);
  syncSessionDirectory(layout, intent.directory);
}

function syncSessionDirectory(layout: SessionFileLayout, directory: string): void {
  if (pathIdentity(layout.sessionDir) !== directory) throw new PromptPublicationError('unknown');
  if (process.platform === 'win32') return;
  const fd = fs.openSync(layout.sessionDir, fs.constants.O_RDONLY | (fs.constants.O_DIRECTORY ?? 0));
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
