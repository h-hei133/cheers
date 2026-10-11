import path from 'node:path';
import { parseContextAttachment } from './syntax.js';
import { readContextEntry, renderContextEntry, assertContextBounds, type ContextEntry } from './entry.js';
import type { FileState } from '../../core/workspace/files.js';

export interface ContextAttachmentOwner {
  readonly root: string;
  readonly assertSourceAccess?: (absolute: string) => void;
  readonly read?: (target: string, maxBytes: number) => FileState;
  readonly persistSession?: (entry: ContextEntry) => void;
  readonly dropSession?: (absolute: string) => void;
  readonly entries?: readonly ContextEntry[];
}

/** Manage explicit extra context without granting filesystem write authority. */
export function runContextAttachmentCommand(args: readonly string[], owner: ContextAttachmentOwner): { readonly output: string; readonly entries: readonly ContextEntry[]; readonly status: 'ok' | 'blocked' | 'unknown' } {
  const parsed = parseContextAttachment(args);
  if ('error' in parsed) return { output: parsed.error, entries: owner.entries ?? [], status: 'blocked' };
  const current = [...(owner.entries ?? [])];
  if (parsed.name === 'files') {
    return { output: current.length ? ['Extra context entries', ...current.map(entry => `${entry.path} source=${entry.source} permissions=${entry.permissions} persistence=${entry.persistence} bytes=${Buffer.byteLength(entry.content, 'utf8')}/${entry.bounds.maxBytes}`)].join('\n') : 'No extra context entries are attached.', entries: current, status: 'ok' };
  }
  const absolute = resolveEntryPath(owner.root, parsed.path);
  if (parsed.name === 'drop') {
    const remaining = current.filter(entry => entry.path !== absolute);
    if (remaining.length === current.length) return { output: `Extra context entry was not attached: ${absolute}`, entries: current, status: 'unknown' };
    owner.dropSession?.(absolute);
    return { output: `Dropped extra context entry: ${absolute}`, entries: remaining, status: 'ok' };
  }
  if (parsed.persistence === 'session' && !owner.persistSession) return { output: 'Session persistence for extra context is unavailable; no entry was attached.', entries: current, status: 'blocked' };
  const entry = readContextEntry({ root: owner.root, target: parsed.path, persistence: parsed.persistence, assertSourceAccess: owner.assertSourceAccess, read: owner.read });
  const next = [...current.filter(item => item.path !== entry.path), entry];
  assertContextBounds(next);
  if (entry.persistence === 'turn' && current.some(item => item.path === entry.path && item.persistence === 'session')) owner.dropSession?.(entry.path);
  if (entry.persistence === 'session') owner.persistSession?.(entry);
  return { output: [`Attached extra context: ${entry.path}`, `Source: ${entry.source}; permissions: ${entry.permissions}; persistence: ${entry.persistence}; bounds: ${entry.bounds.maxBytes} bytes/${entry.bounds.maxCharacters} characters`, renderContextEntry(entry)].join('\n'), entries: next, status: 'ok' };
}

function resolveEntryPath(root: string, target: string): string {
  return path.resolve(root, target);
}
