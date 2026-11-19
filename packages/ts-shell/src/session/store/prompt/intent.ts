import fs from 'node:fs';
import path from 'node:path';
import { hashContent, readTextFile } from '../../../core/workspace/files.js';
import { isRecord } from '../../../core/values/record.js';
import { decodeTranscriptLine } from '../../sessionEventCodec.js';
import type { TranscriptAppendSource } from '../../transcript/append.js';
import type { SessionFileLayout } from '../sessionFileLayout.js';
import { fileVersion } from '../version.js';

const MAX_INTENT_BYTES = 192 * 1024 * 1024;
const MAX_METADATA_BYTES = 1024 * 1024;
const MAX_STATE_BYTES = 64 * 1024 * 1024;

export interface PromptIntent {
  readonly version: 1;
  readonly sessionId: string;
  readonly directory: string;
  readonly transcript: TranscriptAppendSource;
  readonly rows: string;
  readonly metadata: PromptFileChange;
  readonly state: PromptFileChange;
}

export interface PromptFileChange {
  readonly before: string;
  readonly after: string;
}

export class PromptPublicationError extends Error {
  constructor(readonly persistence: 'unchanged' | 'unknown' | 'persisted') {
    super(persistence === 'persisted' ? 'The prompt was saved. Reopen the saved session before continuing.'
      : persistence === 'unknown' ? 'Prompt persistence is unknown. Reopen the saved session to check it.' : 'The prompt could not be saved.');
    this.name = 'PromptPublicationError';
  }
}

export function promptIntentPath(layout: Pick<SessionFileLayout, 'stateLockPath'>): string {
  return path.join(path.dirname(layout.stateLockPath), 'prompt-transaction.json');
}

export function assertNoPromptIntent(layout: Pick<SessionFileLayout, 'stateLockPath'>): void {
  if (hasPromptIntent(layout)) throw new PromptPublicationError('unknown');
}

export function hasPromptIntent(layout: Pick<SessionFileLayout, 'stateLockPath'>): boolean {
  try { fs.lstatSync(promptIntentPath(layout)); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}

/** Keep read-only projections out of a prompt that begins or survives the read. */
export function capturePromptRead(layout: SessionFileLayout): () => void {
  const version = () => [layout.metadataPath, layout.statePath].map(file => fileVersion(fs.lstatSync(file)).join(':')).join('/');
  assertNoPromptIntent(layout);
  const before = version();
  return () => {
    if (version() !== before) throw new Error('The saved session changed during acquisition.');
    assertNoPromptIntent(layout);
  };
}

export function readPromptIntent(layout: SessionFileLayout, sessionId: string): PromptIntent | undefined {
  const text = readTextFile(promptIntentPath(layout), MAX_INTENT_BYTES);
  if (text === undefined) return undefined;
  const value: unknown = JSON.parse(text);
  if (!isRecord(value) || value.version !== 1 || value.sessionId !== sessionId || typeof value.directory !== 'string'
    || !isRecord(value.transcript) || typeof value.transcript.identity !== 'string' || typeof value.transcript.bytes !== 'number'
    || !Number.isSafeInteger(value.transcript.bytes) || value.transcript.bytes < 0 || !isDigest(value.transcript.sha256)
    || typeof value.transcript.separator !== 'boolean' || typeof value.rows !== 'string'
    || !isFileChange(value.metadata, MAX_METADATA_BYTES) || !isFileChange(value.state, MAX_STATE_BYTES)) throw new PromptPublicationError('unknown');
  const [lifecycle, message, end, extra] = value.rows.split('\n', 4);
  if (!lifecycle || !message || end !== '' || extra !== undefined) throw new PromptPublicationError('unknown');
  const started = decodeTranscriptLine(lifecycle), saved = decodeTranscriptLine(message);
  const metadata: unknown = JSON.parse(value.metadata.after), state: unknown = JSON.parse(value.state.after);
  if (started.type !== 'lifecycle' || started.event !== 'run-started' || saved.type !== 'message' || saved.role !== 'user'
    || !saved.id || started.sourceEntryId !== saved.id || started.timestamp !== saved.timestamp
    || !isRecord(metadata) || metadata.id !== sessionId || metadata.updatedAt !== started.timestamp
    || !isRecord(state) || state.projectRoot !== metadata.projectRoot || state.status !== 'active'
    || state.runPhase !== 'prompt-persisted' || state.pendingPromptEntryId !== saved.id || state.pendingPrompt !== started.detail
    || (typeof saved.content === 'string' ? saved.content : saved.content[0]?.type === 'text' ? saved.content[0].text : undefined) !== started.detail) {
    throw new PromptPublicationError('unknown');
  }
  return value as unknown as PromptIntent;
}

export function encodePromptIntent(intent: PromptIntent): string {
  if (!isFileChange(intent.metadata, MAX_METADATA_BYTES) || !isFileChange(intent.state, MAX_STATE_BYTES)) throw new PromptPublicationError('unchanged');
  const text = JSON.stringify(intent);
  if (Buffer.byteLength(text) > MAX_INTENT_BYTES) throw new PromptPublicationError('unchanged');
  return text;
}

export function promptFileText(path: string, kind: 'metadata' | 'state'): string {
  const text = readTextFile(path, kind === 'metadata' ? MAX_METADATA_BYTES : MAX_STATE_BYTES);
  if (text === undefined) throw new Error('The saved prompt source file is unavailable.');
  return text;
}

export function identifyPromptFile(path: string, kind: 'metadata' | 'state', change: PromptFileChange): 'before' | 'after' {
  const current = promptFileText(path, kind);
  if (current === change.after) return 'after';
  if (hashContent(current) === change.before) return 'before';
  throw new PromptPublicationError('unknown');
}

function isDigest(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function isFileChange(value: unknown, maxBytes: number): value is PromptFileChange {
  return isRecord(value) && isDigest(value.before) && typeof value.after === 'string' && Buffer.byteLength(value.after) <= maxBytes;
}
