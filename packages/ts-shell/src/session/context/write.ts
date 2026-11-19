import { lstatSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { sameValue } from '../../config/values.js';
import { SessionPublicationError } from '../store/bound.js';
import { createSessionStoreLayout, locateExistingSessionLayout, validateSessionId, type SessionFileLayout } from '../store/sessionFileLayout.js';
import { withFileLock, writeTextFileAtomic } from '../store/sessionFileStore.js';
import { fileVersion, readSessionFileVersion } from '../store/version.js';
import { assertBranchStoreState, readBranchStoreState, type BranchStoreState } from '../branch/store/state.js';
import { encodeTranscriptEvent } from '../sessionEventCodec.js';
import { appendTranscriptEvent, TranscriptAppendError } from '../transcript/sessionTranscript.js';
import { NAVIGATION_LIMITS } from '../query/navigation/limits.js';
import type { Session } from '../schema/sessionRecord.js';
import type { SessionStateSnapshot } from '../schema/sessionStateSnapshot.js';
import { annotationTargetDigest, captureAnnotationChange, isAnnotationEntryId, isEditableMessage, isSessionAnnotation,
  type AnnotationChange, type SessionAnnotation } from './annotations.js';

export interface AppendSessionAnnotation {
  readonly session: Pick<Session, 'id' | 'createdAt' | 'projectRoot'>;
  readonly expectedVersion: string;
  readonly targetId: string;
  readonly change: AnnotationChange;
  readonly admission?: () => string | undefined;
}

export interface SessionAnnotationPublication {
  readonly event: SessionAnnotation;
  readonly session: Session;
  readonly version: string;
}

/** Append the annotation first. The existing thread is the sole publication authority. */
export function appendSessionAnnotation(input: AppendSessionAnnotation): SessionAnnotationPublication {
  const { id, createdAt, projectRoot } = input.session;
  const { targetId, expectedVersion, admission } = input;
  if (validateSessionId(id) !== id || id === '.' || id === '..' || !isAnnotationEntryId(targetId)) throw new SessionPublicationError('invalid');
  const change = captureAnnotationChange(input.change);
  if (!change) throw new SessionPublicationError('invalid');
  const store = createSessionStoreLayout();
  const layout = locateExistingSessionLayout(store, id);
  let persistence: SessionPublicationError['state'] = 'unchanged';
  let stage: SessionPublicationError['code'] = 'lock-failed';
  try {
    return withFileLock(layout.stateLockPath, () => {
      if (admission?.()) throw new SessionPublicationError('conflict');
      stage = 'unavailable';
      const captured = readBranchStoreState(store, id, projectRoot, undefined, NAVIGATION_LIMITS);
      if (captured.bound.layout.sessionDir !== layout.sessionDir || captured.bound.scope.sessionCreatedAt !== createdAt
        || captured.version !== expectedVersion || captured.bound.state.pendingPrompt !== undefined
        || (captured.bound.state.runPhase !== undefined && captured.bound.state.runPhase !== 'idle')) throw new SessionPublicationError('conflict');
      const target = captured.events.find(event => event.type === 'message' && event.id === targetId);
      if (!target || target.type !== 'message' || !captured.activeEntryIds.includes(targetId)
        || (change.type === 'context-edit' && (!isEditableMessage(target) || !captured.session.turns.some(turn => turn.id === target.id))))
        throw new SessionPublicationError('invalid');
      const event = { ...change, id: `annotation_${randomUUID()}`, parentId: captured.activeLeafId, targetId,
        targetDigest: annotationTargetDigest(target), timestamp: new Date().toISOString() };
      if (!isSessionAnnotation(event)) throw new SessionPublicationError('invalid');
      const state = nextState(captured, event);
      const text = JSON.stringify(state, null, 2);
      if (Buffer.byteLength(text) > NAVIGATION_LIMITS.stateBytes) throw new SessionPublicationError('invalid');
      const beforeState = stateVersion(layout);
      if (admission?.()) throw new SessionPublicationError('conflict');
      if (readSessionFileVersion(layout) !== captured.version || locateExistingSessionLayout(store, id).sessionDir !== layout.sessionDir)
        throw new SessionPublicationError('conflict');
      stage = 'write-failed'; persistence = 'unknown';
      appendTranscriptEvent(layout.transcriptPath, event, undefined, {
        requireExisting: true, expectedIdentity: captured.transcriptIdentity, expectedPrefix: captured.transcriptPrefix, durable: true,
      });
      stage = 'verification-failed';
      const prepared = readBranchStoreState(store, id, projectRoot, captured.transcriptPrefix, NAVIGATION_LIMITS);
      assertBranchStoreState(prepared, captured);
      if (!sameValue(beforeState, stateVersion(layout)) || !sameValue(prepared.bound.state, captured.bound.state)
        || prepared.events.length !== captured.events.length + 1 || !sameValue(prepared.events.at(-1), event)) {
        throw new SessionPublicationError('verification-failed', 'unknown');
      }
      stage = 'write-failed';
      writeTextFileAtomic(layout.statePath, text, undefined, { beforeRename: () => {
        if (admission?.() || readSessionFileVersion(layout) !== prepared.version || locateExistingSessionLayout(store, id).sessionDir !== layout.sessionDir)
          throw new SessionPublicationError('conflict', 'unknown');
      } });
      stage = 'verification-failed';
      const committed = readBranchStoreState(store, id, projectRoot, captured.transcriptPrefix, NAVIGATION_LIMITS);
      if (committed.bound.directoryIdentity !== captured.bound.directoryIdentity || !sameValue(committed.bound.scope, captured.bound.scope)
        || committed.sourcePathIdentity !== captured.sourcePathIdentity || committed.transcriptIdentity !== captured.transcriptIdentity
        || committed.activeLeafId !== event.id || !sameValue(committed.bound.state, state)
        || committed.events.length !== prepared.events.length || !sameValue(committed.events.at(-1), event)) {
        throw new SessionPublicationError('verification-failed', 'unknown');
      }
      stage = 'lock-failed'; persistence = 'persisted';
      return { event, session: committed.session, version: committed.version };
    }, { createParent: false, recovery: 'local-dead' });
  } catch (error) {
    if (error instanceof TranscriptAppendError) persistence = error.persistence;
    throw new SessionPublicationError(error instanceof SessionPublicationError ? error.code : stage, persistence);
  }
}

function stateVersion(layout: SessionFileLayout) {
  return [fileVersion(lstatSync(layout.metadataPath)), fileVersion(lstatSync(layout.statePath))];
}

function nextState(before: BranchStoreState, event: SessionAnnotation): SessionStateSnapshot {
  if (before.thread.entries.length >= NAVIGATION_LIMITS.entries || before.events.length + 2 > NAVIGATION_LIMITS.transcriptLines
    || before.transcriptPrefix.bytes + Buffer.byteLength(encodeTranscriptEvent(event)) + 2 > NAVIGATION_LIMITS.transcriptBytes)
    throw new SessionPublicationError('invalid');
  return { ...before.bound.state, thread: { ...before.thread, activeLeafId: event.id, navigationRevision: event.id,
    entries: [...before.thread.entries, { id: event.id, parentId: event.parentId, kind: event.type,
      order: before.thread.entries.length, timestamp: event.timestamp }] } };
}
