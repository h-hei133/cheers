import fs from 'node:fs';
import path from 'node:path';
import { pathIdentity } from '../../core/workspace/files.js';
import { createTranscriptHeader, encodeTranscriptEvent, type TranscriptEvent } from '../sessionEventCodec.js';
import type { Session } from '../schema/sessionRecord.js';
import type { SessionStateSnapshot } from '../schema/sessionStateSnapshot.js';
import { syncStoreDirectory } from './directory.js';
import { writeSessionMetadataRecord } from './metadata.js';
import { projectSessionFileLayout, reserveSessionLayout, sessionCreationDirectory, type SessionFileLayout, type SessionStoreLayout } from './sessionFileLayout.js';
import { writeJsonFileAtomic } from './sessionFileStore.js';
import { writeSessionState } from './sessionStateStore.js';

export class SessionCreationUnverifiedError extends Error {
  constructor(readonly sessionId: string, cause: unknown) {
    super(`Creation of session ${sessionId} is unverified.`, { cause });
    this.name = 'SessionCreationUnverifiedError';
  }
}

export interface InitialSessionRecord {
  readonly state: SessionStateSnapshot;
  readonly events: readonly TranscriptEvent[];
  readonly beforePublish: () => void;
}

export function createSessionRecord(session: Session, store: SessionStoreLayout, initial?: InitialSessionRecord): void {
  if (initial) return createCompleteSessionRecord(session, store, initial);
  const layout = reserveSessionLayout(store, session.id);
  try {
    writeSessionFiles({ session, layout }, 'exclusive');
  } catch (error) {
    // Preserve the reservation so a retry cannot overwrite the uncertain record.
    throw new SessionCreationUnverifiedError(session.id, error);
  }
}

/** Publish a complete fork as one directory entry, before selecting it. */
function createCompleteSessionRecord(session: Session, store: SessionStoreLayout, initial: InitialSessionRecord): void {
  const parent = sessionCreationDirectory(store);
  fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
  const parentIdentity = pathIdentity(parent);
  const targetParent = pathIdentity(store.sessionsDir);
  const stage = fs.mkdtempSync(path.join(parent, 'fork-'));
  const stagedIdentity = pathIdentity(stage);
  const layout = projectSessionFileLayout({ sessionsDir: parent, sessionId: path.basename(stage) });
  let moved = false;
  try {
    try {
      writeSessionFiles({ session, layout }, 'exclusive', initial);
      syncStoreDirectory(stage, stagedIdentity);
    } catch (error) {
      throw new SessionCreationUnverifiedError(session.id, error);
    }
    reserveSessionLayout(store, session.id, target => {
      initial.beforePublish();
      if (pathIdentity(stage) !== stagedIdentity || pathIdentity(store.sessionsDir) !== targetParent
        || pathIdentity(parent) !== parentIdentity) throw new Error('The session publication directory changed.');
      fs.renameSync(stage, target.sessionDir);
      moved = true;
      syncStoreDirectory(store.sessionsDir, targetParent);
      syncStoreDirectory(parent, parentIdentity);
    });
  } catch (error) {
    if (moved) throw new SessionCreationUnverifiedError(session.id, error);
    throw error;
  } finally {
    try {
      if (!moved && pathIdentity(stage) === stagedIdentity) fs.rmSync(stage, { recursive: true, force: true });
    } catch { /* The unpublished stage remains private. */ }
  }
}

interface SessionRecordWrite {
  readonly session: Session;
  readonly layout: SessionFileLayout;
}

export function writeSessionRecord(input: SessionRecordWrite): void {
  if (!fs.existsSync(input.layout.sessionDir)) fs.mkdirSync(input.layout.sessionDir, { recursive: true });
  writeSessionFiles(input, 'existing');
}

function writeSessionFiles({ session, layout }: SessionRecordWrite, mode: 'exclusive' | 'existing', initial?: InitialSessionRecord): void {
  if (mode === 'exclusive' || !fs.existsSync(layout.transcriptPath)) {
    const header = createTranscriptHeader({ sessionId: session.id, timestamp: session.createdAt, cwd: session.projectRoot });
    const headerLine = `${JSON.stringify(header)}\n`;
    if (initial) {
      const fd = fs.openSync(layout.transcriptPath, 'wx');
      try {
        fs.writeFileSync(fd, headerLine, 'utf8');
        for (const event of initial.events) fs.writeFileSync(fd, `${encodeTranscriptEvent(event)}\n`, 'utf8');
        fs.fsyncSync(fd);
      } finally { fs.closeSync(fd); }
    } else {
      fs.writeFileSync(layout.transcriptPath, headerLine, { encoding: 'utf8', flag: mode === 'exclusive' ? 'wx' : 'w' });
    }
  }
  writeSessionMetadataRecord({ session, layout });
  if (initial) writeJsonFileAtomic(layout.statePath, initial.state);
  else writeSessionState({ session, layout });
}
