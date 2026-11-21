import fs from 'node:fs';
import { hashContent, pathIdentity, readTextFile } from '../../../core/workspace/files.js';
import type { SessionMetadata } from '../../schema/sessionMetadataCodec.js';
import type { SessionStateSnapshot } from '../../schema/sessionStateSnapshot.js';
import type { PreparedActivationMetadata, SessionActivationIdentity } from '../activation.js';
import { syncStoreDirectory } from '../directory.js';
import type { SessionFileLayout } from '../sessionFileLayout.js';
import { writeTextFileAtomic } from '../sessionFileStore.js';
import { assertNoPromptIntent, encodePromptIntent, identifyPromptFile, PromptPublicationError,
  promptFileText, promptIntentPath, type ActivationIntent, type PromptFileChange } from './intent.js';

let checkPreparedWorkspace: ((layout: SessionFileLayout) => boolean) | undefined;

export function assertWorkspaceSnapshotReadable(layout: SessionFileLayout): void {
  if (!checkPreparedWorkspace?.(layout)) assertNoPromptIntent(layout);
}

export function prepareActivationMetadata(layout: SessionFileLayout, identity: SessionActivationIdentity,
  metadata: SessionMetadata, state?: SessionStateSnapshot): PreparedActivationMetadata {
  const directory = pathIdentity(layout.sessionDir);
  const before = promptFileText(layout.metadataPath, 'metadata');
  const record = { sessionId: metadata.id, directory, ...identity,
    metadata: { before: hashContent(before), after: JSON.stringify(metadata, null, 2) } };
  const intent: ActivationIntent = state === undefined ? { version: 4, ...record } : {
    version: 5, ...record,
    state: { before: hashContent(promptFileText(layout.statePath, 'state')), after: JSON.stringify(state, null, 2) },
  };
  const encoded = encodePromptIntent(intent);
  const marker = promptIntentPath(layout);
  writeTextFileAtomic(marker, encoded, 0o600, { createParent: false, beforeRename: () => {
    assertNoPromptIntent(layout);
    activationFiles(layout, intent, false);
  } });
  syncStoreDirectory(layout.sessionDir, directory);
  const markerIdentity = pathIdentity(marker);
  const assertCurrent = () => {
    assertActivationIntent(layout, intent, encoded, markerIdentity);
    activationFiles(layout, intent, false);
  };
  return {
    receipt: hashContent(encoded),
    assertCurrent,
    // Only a metadata-only resume may read its own pre-commit workspace.
    ...(intent.version === 4 ? { checkWorkspaceAdmission: (check: () => void) => {
      const previous = checkPreparedWorkspace;
      checkPreparedWorkspace = target => {
        if (promptIntentPath(target) !== marker) return false;
        assertCurrent();
        return true;
      };
      try { check(); } finally { checkPreparedWorkspace = previous; }
    } } : {}),
    finish: () => finishActivationMetadata(layout, intent, true),
  };
}

export function activationRecordText(layout: SessionFileLayout, intent: ActivationIntent, committed: boolean) {
  const files = activationFiles(layout, intent, committed);
  return {
    metadata: committed ? intent.metadata.after : promptFileText(layout.metadataPath, 'metadata'),
    ...(intent.version === 5 && files.state ? {
      state: committed ? intent.state.after : promptFileText(layout.statePath, 'state'),
    } : {}),
  };
}

export function finishActivationMetadata(layout: SessionFileLayout, intent: ActivationIntent, committed: boolean): void {
  const marker = promptIntentPath(layout);
  const identity = pathIdentity(marker);
  const encoded = encodePromptIntent(intent);
  const check = () => {
    assertActivationIntent(layout, intent, encoded, identity);
    return activationFiles(layout, intent, committed);
  };
  const files = check();
  if (committed) {
    if (files.state === 'before' && intent.version === 5) {
      writeTextFileAtomic(layout.statePath, intent.state.after, undefined, { createParent: false, beforeRename: check });
    }
    if (files.metadata === 'before') {
      writeTextFileAtomic(layout.metadataPath, intent.metadata.after, undefined, { createParent: false, beforeRename: check });
    }
  }
  syncStoreDirectory(layout.sessionDir, intent.directory);
  const saved = check();
  if (committed && (saved.metadata === 'before' || saved.state === 'before')) {
    throw new PromptPublicationError('unknown', 'record');
  }
  fs.unlinkSync(marker);
  syncStoreDirectory(layout.sessionDir, intent.directory);
}

function activationFiles(layout: SessionFileLayout, intent: ActivationIntent, committed: boolean) {
  if (pathIdentity(layout.sessionDir) !== intent.directory) throw new PromptPublicationError('unknown', 'record');
  const identify = (path: string, kind: 'metadata' | 'state', change: PromptFileChange) => {
    const current = identifyPromptFile(path, kind, change);
    if (!committed && current === 'after') throw new PromptPublicationError('unknown', 'record');
    return current;
  };
  return {
    metadata: identify(layout.metadataPath, 'metadata', intent.metadata),
    state: intent.version === 5 ? identify(layout.statePath, 'state', intent.state) : undefined,
  };
}

function assertActivationIntent(layout: SessionFileLayout, intent: ActivationIntent, encoded: string, identity: string): void {
  const marker = promptIntentPath(layout);
  if (pathIdentity(layout.sessionDir) !== intent.directory || pathIdentity(marker) !== identity
    || readTextFile(marker, Buffer.byteLength(encoded)) !== encoded) throw new PromptPublicationError('unknown', 'record');
}
