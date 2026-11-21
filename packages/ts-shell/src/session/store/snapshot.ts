import type { SessionMetadata } from '../schema/sessionMetadataCodec.js';
import { assertNoPromptIntent } from './prompt/intent.js';
import type { SessionFileLayout } from './sessionFileLayout.js';
import { readJsonFileWithRetry, readJsonFileWithRetryAsync } from './sessionFileStore.js';
import { readStateSnapshotRequired, readStateSnapshotRequiredAsync } from './sessionStateStore.js';
import { readSessionFileVersion } from './version.js';

export interface SessionSnapshotLimits {
  readonly metadataBytes: number;
  readonly stateBytes: number;
}

interface SnapshotOptions {
  readonly limits?: SessionSnapshotLimits;
  readonly signal?: AbortSignal;
  readonly includeTranscript?: boolean;
}

export class SessionSnapshotConflict extends Error {
  constructor() {
    super('The saved session changed during acquisition.');
    this.name = 'SessionSnapshotConflict';
  }
}

export function readSessionMetadataRecord(metadataPath: string, maxBytes?: number, signal?: AbortSignal): SessionMetadata | undefined {
  return readJsonFileWithRetry<SessionMetadata>(metadataPath, {
    required: true, parseErrorDetail: 'Failed to load session metadata', maxBytes, signal,
  });
}

function readSessionMetadataRecordAsync(metadataPath: string, maxBytes?: number, signal?: AbortSignal): Promise<SessionMetadata | undefined> {
  return readJsonFileWithRetryAsync<SessionMetadata>(metadataPath, {
    required: true, parseErrorDetail: 'Failed to load session metadata', maxBytes, signal,
  });
}

export function readSessionSnapshot(layout: SessionFileLayout, options?: SnapshotOptions) {
  const capture = captureSnapshot(layout, options);
  const metadata = readSessionMetadataRecord(layout.metadataPath, options?.limits?.metadataBytes, options?.signal);
  const state = readStateSnapshotRequired(layout.statePath, options?.limits?.stateBytes, options?.signal);
  capture.assertCurrent();
  return { metadata, state, ...capture };
}

export async function readSessionSnapshotAsync(layout: SessionFileLayout, options?: SnapshotOptions) {
  const capture = captureSnapshot(layout, options);
  const metadata = await readSessionMetadataRecordAsync(layout.metadataPath, options?.limits?.metadataBytes, options?.signal);
  const state = await readStateSnapshotRequiredAsync(layout.statePath, options?.limits?.stateBytes, options?.signal);
  capture.assertCurrent();
  return { metadata, state, ...capture };
}

function captureSnapshot(layout: SessionFileLayout, options?: SnapshotOptions) {
  const readVersion = () => readSessionFileVersion(layout, { ignoreTranscript: !options?.includeTranscript });
  options?.signal?.throwIfAborted();
  assertNoPromptIntent(layout);
  const version = readVersion();
  return { version, assertCurrent: () => {
    options?.signal?.throwIfAborted();
    if (readVersion() !== version) throw new SessionSnapshotConflict();
    assertNoPromptIntent(layout);
  } };
}
