import fs from 'node:fs';
import { hashContent, pathIdentity, readTextFile } from '../../../core/workspace/files.js';
import type { SessionMetadata } from '../../schema/sessionMetadataCodec.js';
import type { PreparedActivationMetadata, SessionActivationIdentity } from '../activation.js';
import { syncStoreDirectory } from '../directory.js';
import type { SessionFileLayout } from '../sessionFileLayout.js';
import { writeTextFileAtomic } from '../sessionFileStore.js';
import { assertNoPromptIntent, encodePromptIntent, identifyPromptFile, PromptPublicationError,
  promptFileText, promptIntentPath, type ActivationIntent } from './intent.js';

export function prepareActivationMetadata(layout: SessionFileLayout, identity: SessionActivationIdentity,
  metadata: SessionMetadata): PreparedActivationMetadata {
  const directory = pathIdentity(layout.sessionDir);
  const before = promptFileText(layout.metadataPath, 'metadata');
  const intent: ActivationIntent = { version: 4, sessionId: metadata.id, directory, ...identity,
    metadata: { before: hashContent(before), after: JSON.stringify(metadata, null, 2) } };
  const encoded = encodePromptIntent(intent);
  const marker = promptIntentPath(layout);
  writeTextFileAtomic(marker, encoded, 0o600, { createParent: false, beforeRename: () => {
    assertNoPromptIntent(layout);
    if (pathIdentity(layout.sessionDir) !== directory || promptFileText(layout.metadataPath, 'metadata') !== before) {
      throw new PromptPublicationError('unchanged', 'record');
    }
  } });
  syncStoreDirectory(layout.sessionDir, directory);
  const markerIdentity = pathIdentity(marker);
  return {
    receipt: hashContent(encoded),
    assertCurrent: () => {
      assertActivationIntent(layout, intent, encoded, markerIdentity);
      activationMetadataText(layout, intent, false);
    },
    finish: () => finishActivationMetadata(layout, intent, true),
  };
}

export function activationMetadataText(layout: SessionFileLayout, intent: ActivationIntent, committed: boolean): string {
  if (pathIdentity(layout.sessionDir) !== intent.directory) throw new PromptPublicationError('unknown', 'record');
  const current = identifyPromptFile(layout.metadataPath, 'metadata', intent.metadata);
  if (committed) return intent.metadata.after;
  if (current === 'after') throw new PromptPublicationError('unknown', 'record');
  return promptFileText(layout.metadataPath, 'metadata');
}

export function finishActivationMetadata(layout: SessionFileLayout, intent: ActivationIntent, committed: boolean): void {
  const marker = promptIntentPath(layout);
  const identity = pathIdentity(marker);
  const encoded = encodePromptIntent(intent);
  const check = () => {
    assertActivationIntent(layout, intent, encoded, identity);
    activationMetadataText(layout, intent, committed);
  };
  check();
  if (committed && identifyPromptFile(layout.metadataPath, 'metadata', intent.metadata) === 'before') {
    writeTextFileAtomic(layout.metadataPath, intent.metadata.after, undefined, { createParent: false, beforeRename: check });
  }
  syncStoreDirectory(layout.sessionDir, intent.directory);
  check();
  if (committed && identifyPromptFile(layout.metadataPath, 'metadata', intent.metadata) === 'before') {
    throw new PromptPublicationError('unknown', 'record');
  }
  fs.unlinkSync(marker);
  syncStoreDirectory(layout.sessionDir, intent.directory);
}

function assertActivationIntent(layout: SessionFileLayout, intent: ActivationIntent, encoded: string, identity: string): void {
  const marker = promptIntentPath(layout);
  if (pathIdentity(layout.sessionDir) !== intent.directory || pathIdentity(marker) !== identity
    || readTextFile(marker, Buffer.byteLength(encoded)) !== encoded) throw new PromptPublicationError('unknown', 'record');
}
