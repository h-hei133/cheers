import fs from 'node:fs';

export const CONFIG_MAX_BYTES = 1024 * 1024;
const MAX_DEPTH = 32;
const MAX_NODES = 50_000;
const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor']);

/** Only controlled codes cross the config diagnostic boundary. */
export class ConfigDocumentError extends Error {
  constructor(readonly code: 'invalid-json' | 'invalid-document' | 'resource-limit' | 'unsafe-key' | 'unsupported-version' | 'unreadable') {
    super(code);
    this.name = 'ConfigDocumentError';
  }
}

/** Iterative preflight protects both schema recursion and raw read-modify-write callers. */
export function inspectConfigDocument(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ConfigDocumentError('invalid-document');
  const pending = [{ value, depth: 0 }];
  let nodes = 0;
  while (pending.length) {
    const entry = pending.pop()!;
    if (++nodes > MAX_NODES || entry.depth > MAX_DEPTH) throw new ConfigDocumentError('resource-limit');
    if (!entry.value || typeof entry.value !== 'object') continue;
    const proto = Object.getPrototypeOf(entry.value);
    if (!Array.isArray(entry.value) && proto !== Object.prototype && proto !== null) throw new ConfigDocumentError('invalid-document');
    const children = Object.entries(entry.value);
    if (nodes + pending.length + children.length > MAX_NODES) throw new ConfigDocumentError('resource-limit');
    for (const [key, child] of children) {
      if (forbiddenKeys.has(key)) throw new ConfigDocumentError('unsafe-key');
      pending.push({ value: child, depth: entry.depth + 1 });
    }
  }
  const version = (value as Record<string, unknown>).schemaVersion;
  // Untagged files are the existing format. An explicit v1 describes that same
  // format; unknown versions are preserved on disk and never written by this build.
  if (version !== undefined && version !== 1) throw new ConfigDocumentError('unsupported-version');
}

/** Bounded handle reads also reject directories/devices; only ENOENT means absent. */
export function readConfigDocument(filePath: string): Record<string, unknown> | undefined {
  let fd: number | undefined;
  try {
    fd = fs.openSync(filePath, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
    if (!fs.fstatSync(fd).isFile()) throw new ConfigDocumentError('unreadable');
    const bytes = Buffer.alloc(CONFIG_MAX_BYTES + 1);
    let used = 0;
    while (used < bytes.length) {
      const count = fs.readSync(fd, bytes, used, Math.min(16 * 1024, bytes.length - used), null);
      if (!count) break;
      used += count;
    }
    if (used > CONFIG_MAX_BYTES) throw new ConfigDocumentError('resource-limit');
    const text = bytes.subarray(0, used).toString('utf8');
    let parsed: unknown;
    try { parsed = JSON.parse(text.startsWith('\uFEFF') ? text.slice(1) : text); }
    catch { throw new ConfigDocumentError('invalid-json'); }
    inspectConfigDocument(parsed);
    return parsed;
  } catch (error) {
    if (fd === undefined && (error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error instanceof ConfigDocumentError ? error : new ConfigDocumentError('unreadable');
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/** Measure the very bytes the writer will publish, including formatting. */
export function serializeConfigDocument(value: unknown): string {
  const text = JSON.stringify(value, null, 2);
  if (Buffer.byteLength(text) > CONFIG_MAX_BYTES) throw new ConfigDocumentError('resource-limit');
  return text;
}
