import fs from 'node:fs';
import path from 'node:path';
import { hashContent } from '../../edit/authority/content.js';
import { inspectWorkspaceFile } from '../../core/workspace/files.js';
import type { FileState } from '../../core/workspace/files.js';

export type ContextEntrySource = 'user' | 'tool' | 'command';
export type ContextEntryPersistence = 'turn' | 'session' | 'none';

export interface ContextEntryBounds {
  readonly maxBytes: number;
  readonly maxCharacters: number;
}

export interface ContextEntry {
  readonly path: string;
  readonly source: ContextEntrySource;
  readonly permissions: 'read-only';
  readonly bounds: ContextEntryBounds;
  readonly persistence: ContextEntryPersistence;
  readonly content: string;
  readonly digest: string;
}

const DEFAULT_BOUNDS: ContextEntryBounds = Object.freeze({ maxBytes: 128 * 1024, maxCharacters: 128 * 1024 });
export const MAX_CONTEXT_BYTES = 512 * 1024;
export const MAX_CONTEXT_ENTRIES = 16;

/** Decode session-persisted entries without trusting arbitrary state-file data. */
export function decodeContextEntries(value: unknown): readonly ContextEntry[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_CONTEXT_ENTRIES) {
    throw new Error('Saved context attachments are invalid; restore the session before sending another prompt.');
  }
  const entries = value.map((raw) => {
    if (!raw || typeof raw !== 'object') throw new Error('Saved context attachments are invalid.');
    const item = raw as Record<string, unknown>;
    const boundsValue = item.bounds;
    if (!boundsValue || typeof boundsValue !== 'object') throw new Error('Saved context attachment bounds are invalid.');
    const bounds = bounded(boundsValue as Partial<ContextEntryBounds>);
    const pathValue = item.path;
    const source = item.source;
    const persistence = item.persistence;
    const content = item.content;
    const digest = item.digest;
    if (typeof pathValue !== 'string' || !path.isAbsolute(pathValue) ||
      (source !== 'user' && source !== 'tool' && source !== 'command') ||
      item.permissions !== 'read-only' || (persistence !== 'turn' && persistence !== 'session' && persistence !== 'none') ||
      typeof content !== 'string' || typeof digest !== 'string' || !/^[0-9a-f]{64}$/.test(digest) ||
      Buffer.byteLength(content, 'utf8') > bounds.maxBytes || content.length > bounds.maxCharacters || hashContent(content) !== digest) {
      throw new Error('Saved context attachment is invalid or exceeds its declared bounds.');
    }
    return Object.freeze({ path: pathValue, source, permissions: 'read-only' as const, bounds, persistence, content, digest });
  });
  assertContextBounds(entries);
  return Object.freeze(entries);
}

/** Read an explicitly selected file as bounded, read-only prompt context. */
export function readContextEntry(input: {
  readonly root: string;
  readonly target: string;
  readonly source?: ContextEntrySource;
  readonly persistence?: ContextEntryPersistence;
  readonly bounds?: Partial<ContextEntryBounds>;
  readonly assertSourceAccess?: (absolute: string) => void;
  readonly read?: (target: string, maxBytes: number) => FileState;
}): ContextEntry {
  const lexicalTarget = path.resolve(input.root, input.target);
  if (!within(input.root, lexicalTarget)) throw new Error('Context entry must stay inside an authorized workspace root.');
  const bounds = bounded(input.bounds);
  const file = input.read ? input.read(lexicalTarget, bounds.maxBytes)
    : inspectWorkspaceFile(input.root, path.relative(input.root, lexicalTarget), input.assertSourceAccess, bounds.maxBytes);
  if (file.state !== 'exists') throw new Error('Context entry does not exist.');
  const target = fs.realpathSync(lexicalTarget);
  const content = file.content;
  if (Buffer.byteLength(content, 'utf8') > bounds.maxBytes || content.length > bounds.maxCharacters) throw new Error('Context entry changed beyond its declared bounds.');
  return Object.freeze({ path: target, source: input.source ?? 'user', permissions: 'read-only', bounds,
    persistence: input.persistence ?? 'turn', content, digest: hashContent(content) });
}

/** Project an entry into the model prompt with provenance and explicit limits. */
export function renderContextEntry(entry: ContextEntry): string {
  const pathLabel = entry.path.replace(/\\/g, '/');
  return `<extra_context path="${escapeTag(pathLabel)}" source="${entry.source}" permissions="read-only" persistence="${entry.persistence}" max_bytes="${entry.bounds.maxBytes}">\n${escapeTag(entry.content)}\n</extra_context>`;
}

/** Recheck persisted paths after a session or workspace root changes. */
export function contextEntryStillAuthorized(root: string, entry: ContextEntry, read?: (target: string, maxBytes: number) => FileState): boolean {
  try {
    if (!within(fs.realpathSync(root), fs.realpathSync(entry.path))) return false;
    const file = read ? read(entry.path, entry.bounds.maxBytes) : inspectWorkspaceFile(root, path.relative(root, entry.path), undefined, entry.bounds.maxBytes);
    return file.state === 'exists' && file.hash === entry.digest;
  } catch {
    return false;
  }
}

export function assertContextBounds(entries: readonly ContextEntry[]): void {
  if (entries.length > MAX_CONTEXT_ENTRIES || entries.reduce((total, entry) => total + Buffer.byteLength(entry.content, 'utf8'), 0) > MAX_CONTEXT_BYTES) {
    throw new Error(`Extra context is limited to ${MAX_CONTEXT_ENTRIES} entries and ${MAX_CONTEXT_BYTES} bytes in total.`);
  }
}

export function bounded(bounds?: Partial<ContextEntryBounds>): ContextEntryBounds {
  const maxBytes = clamp(bounds?.maxBytes ?? DEFAULT_BOUNDS.maxBytes, 1, DEFAULT_BOUNDS.maxBytes);
  const maxCharacters = clamp(bounds?.maxCharacters ?? DEFAULT_BOUNDS.maxCharacters, 1, DEFAULT_BOUNDS.maxCharacters);
  return Object.freeze({ maxBytes, maxCharacters });
}

function within(root: string, target: string): boolean {
  const relative = path.relative(path.resolve(root), target);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function clamp(value: number, min: number, max: number): number {
  return Number.isSafeInteger(value) ? Math.min(max, Math.max(min, value)) : min;
}

function escapeTag(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
