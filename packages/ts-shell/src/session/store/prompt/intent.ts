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
const RECORD_STATUSES = new Set(['active', 'interrupted', 'completed', 'completed_unproven', 'error', 'terminated']);

export interface PromptIntent {
  readonly version: 1 | 2 | 3;
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

export type PromptTransactionKind = 'prompt' | 'outcome' | 'record';

export class PromptPublicationError extends Error {
  constructor(readonly persistence: 'unchanged' | 'unknown' | 'persisted', readonly kind: PromptTransactionKind = 'prompt') {
    const subject = kind === 'prompt' ? 'prompt' : kind === 'outcome' ? 'prompt outcome' : 'session update';
    super(persistence === 'persisted' ? `The ${subject} was saved. Reopen the saved session before continuing.`
      : persistence === 'unknown' ? `${subject[0]!.toUpperCase()}${subject.slice(1)} persistence is unknown. Reopen the saved session to check it.`
      : `The ${subject} could not be saved.`);
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
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw new PromptPublicationError('unknown');
  }
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
  if (!isRecord(value) || (value.version !== 1 && value.version !== 2 && value.version !== 3) || value.sessionId !== sessionId || typeof value.directory !== 'string'
    || !isRecord(value.transcript) || typeof value.transcript.identity !== 'string' || typeof value.transcript.bytes !== 'number'
    || !Number.isSafeInteger(value.transcript.bytes) || value.transcript.bytes < 0 || !isDigest(value.transcript.sha256)
    || typeof value.transcript.separator !== 'boolean' || typeof value.rows !== 'string'
    || !isFileChange(value.metadata, MAX_METADATA_BYTES) || !isFileChange(value.state, MAX_STATE_BYTES)) throw new PromptPublicationError('unknown');
  const metadata: unknown = JSON.parse(value.metadata.after), state: unknown = JSON.parse(value.state.after);
  if (!isRecord(metadata) || metadata.id !== sessionId || !isRecord(state) || state.projectRoot !== metadata.projectRoot) {
    throw new PromptPublicationError('unknown');
  }
  if (value.version === 2) {
    if (!isSettlementIntent(value.rows, metadata, state)) throw new PromptPublicationError('unknown', 'outcome');
    return value as unknown as PromptIntent;
  }
  if (value.version === 3) {
    if (!isRecordIntent(value.rows, metadata, state)) throw new PromptPublicationError('unknown', 'record');
    return value as unknown as PromptIntent;
  }
  const [lifecycle, message, end, extra] = value.rows.split('\n', 4);
  if (!lifecycle || !message || end !== '' || extra !== undefined) throw new PromptPublicationError('unknown');
  const started = decodeTranscriptLine(lifecycle), saved = decodeTranscriptLine(message);
  if (started.type !== 'lifecycle' || started.event !== 'run-started' || saved.type !== 'message' || saved.role !== 'user'
    || !saved.id || started.sourceEntryId !== saved.id || started.timestamp !== saved.timestamp
    || metadata.updatedAt !== started.timestamp || state.status !== 'active'
    || state.runPhase !== 'prompt-persisted' || state.pendingPromptEntryId !== saved.id || state.pendingPrompt !== started.detail
    || (typeof saved.content === 'string' ? saved.content : saved.content[0]?.type === 'text' ? saved.content[0].text : undefined) !== started.detail) {
    throw new PromptPublicationError('unknown');
  }
  return value as unknown as PromptIntent;
}

function isRecordIntent(rows: string, metadata: Record<string, unknown>, state: Record<string, unknown>): boolean {
  if (typeof metadata.updatedAt !== 'string' || typeof state.status !== 'string' || !RECORD_STATUSES.has(state.status)) return false;
  if (rows === '') return true;
  const lines = rows.split('\n', 3);
  if (lines.length !== 2 || lines[1] !== '') return false;
  const event = decodeTranscriptLine(lines[0]!);
  if (event.timestamp !== metadata.updatedAt) return false;
  if (event.type === 'message') return typeof event.id === 'string' && event.id.length > 0;
  if (event.type !== 'lifecycle') return false;
  if (event.event === 'run-started') return state.status === 'active' && state.pendingPrompt === event.detail;
  if (event.event === 'run-terminated') return state.status === 'terminated' && state.runPhase === 'idle' && state.pendingPrompt === undefined;
  return false;
}

function isSettlementIntent(rows: string, metadata: Record<string, unknown>, state: Record<string, unknown>): boolean {
  const lines = rows.split('\n', 4);
  if ((lines.length !== 2 && lines.length !== 3) || lines.pop() !== '') return false;
  const lifecycle = decodeTranscriptLine(lines.pop()!);
  if (lifecycle.type !== 'lifecycle' || lifecycle.timestamp !== metadata.updatedAt) return false;
  const diagnostic = lines.length ? decodeTranscriptLine(lines[0]!) : undefined;
  if (diagnostic && (diagnostic.type !== 'query-event' || diagnostic.timestamp !== lifecycle.timestamp)) return false;
  const event = diagnostic?.event;
  switch (lifecycle.event) {
    case 'run-completed':
    case 'run-completed-unproven': {
      const status = lifecycle.event === 'run-completed' ? 'completed' : 'completed_unproven';
      return event === undefined && state.status === status && state.runPhase === 'idle' &&
        state.pendingPrompt === undefined && state.pendingPromptEntryId === undefined;
    }
    case 'run-error':
      return (event === undefined || (event.type === 'lifecycle.error' && event.error === lifecycle.detail)) &&
        state.status === 'error' && state.runPhase === 'idle' && state.pendingPrompt === undefined &&
        state.pendingPromptEntryId === undefined;
    case 'run-interrupted':
      return (event === undefined || event.type === 'lifecycle.cancelled') && state.status === 'interrupted' &&
        (state.interruptedKind === 'prompt' || state.interruptedKind === 'turn') && state.pendingPrompt === lifecycle.detail;
    default: return false;
  }
}

export function encodePromptIntent(intent: PromptIntent): string {
  if (!isFileChange(intent.metadata, MAX_METADATA_BYTES) || !isFileChange(intent.state, MAX_STATE_BYTES)) throw new PromptPublicationError('unchanged');
  if (intent.version === 2 && !isSettlementIntent(intent.rows, JSON.parse(intent.metadata.after), JSON.parse(intent.state.after))) {
    throw new PromptPublicationError('unchanged', 'outcome');
  }
  if (intent.version === 3 && !isRecordIntent(intent.rows, JSON.parse(intent.metadata.after), JSON.parse(intent.state.after))) {
    throw new PromptPublicationError('unchanged', 'record');
  }
  const text = JSON.stringify(intent);
  if (Buffer.byteLength(text) > MAX_INTENT_BYTES) throw new PromptPublicationError('unchanged');
  return text;
}

export function promptFileText(path: string, kind: 'metadata' | 'state'): string {
  const text = readTextFile(path, kind === 'metadata' ? MAX_METADATA_BYTES : MAX_STATE_BYTES);
  if (text === undefined) throw new Error('The saved prompt source file is unavailable.');
  return text;
}

export function identifyPromptFile(path: string, kind: 'metadata' | 'state', change: PromptFileChange): 'before' | 'after' | 'both' {
  const current = promptFileText(path, kind);
  if (current === change.after) return hashContent(current) === change.before ? 'both' : 'after';
  if (hashContent(current) === change.before) return 'before';
  throw new PromptPublicationError('unknown');
}

function isDigest(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function isFileChange(value: unknown, maxBytes: number): value is PromptFileChange {
  return isRecord(value) && isDigest(value.before) && typeof value.after === 'string' && Buffer.byteLength(value.after) <= maxBytes;
}
