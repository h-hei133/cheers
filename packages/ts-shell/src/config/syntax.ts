import { parse, visit } from 'jsonc-parser';

export const CONFIG_MAX_BYTES = 1024 * 1024;
const MAX_DEPTH = 32;
const MAX_NODES = 50_000;
const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor']);

/** Only controlled codes cross the config diagnostic boundary. */
export class ConfigDocumentError extends Error {
  constructor(readonly code: 'invalid-json' | 'invalid-document' | 'resource-limit' | 'unsafe-key' | 'unsupported-version' | 'unreadable' | 'duplicate-key' | 'invalid-number' | 'invalid-utf8' | 'edit-mismatch' | 'content-changed', readonly position?: { offset: number; line: number; column: number }) {
    super(position ? `${code} at line ${position.line}, column ${position.column}` : code);
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
    if (typeof entry.value === 'number' && !Number.isFinite(entry.value)) throw new ConfigDocumentError('invalid-number');
    if (typeof entry.value === 'function' || typeof entry.value === 'symbol' || typeof entry.value === 'bigint') throw new ConfigDocumentError('invalid-document');
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

/** Keep UTF-16 offsets stable while allowing the existing optional BOM. */
export function configParserText(text: string): string {
  return text.startsWith('\uFEFF') ? ' ' + text.slice(1) : text;
}

/** Stop the tolerant parser before it can allocate a deep/ambiguous document. */
export function parseConfigText(text: string): Record<string, unknown> {
  if (Buffer.byteLength(text) > CONFIG_MAX_BYTES) throw new ConfigDocumentError('resource-limit');
  const input = configParserText(text);
  const parents: (Set<string> | null)[] = [];
  let nodes = 0;
  function count(offset: number, line: number, column: number): void {
    if (++nodes > MAX_NODES || parents.length > MAX_DEPTH) throw new ConfigDocumentError('resource-limit', { offset, line: line + 1, column: column + 1 });
  }
  visit(input, {
    onObjectBegin(offset, _length, line, column) { count(offset, line, column); parents.push(new Set()); },
    onArrayBegin(offset, _length, line, column) { count(offset, line, column); parents.push(null); },
    onObjectEnd() { parents.pop(); },
    onArrayEnd() { parents.pop(); },
    onObjectProperty(key, offset, _length, line, column) {
      const position = { offset, line: line + 1, column: column + 1 };
      if (forbiddenKeys.has(key)) throw new ConfigDocumentError('unsafe-key', position);
      const keys = parents[parents.length - 1]!;
      if (keys.has(key)) throw new ConfigDocumentError('duplicate-key', position);
      keys.add(key);
    },
    onLiteralValue(value, offset, _length, line, column) {
      count(offset, line, column);
      if (typeof value === 'number' && !Number.isFinite(value)) throw new ConfigDocumentError('invalid-number', { offset, line: line + 1, column: column + 1 });
    },
    onError(_code, offset, _length, line, column) {
      throw new ConfigDocumentError('invalid-json', { offset, line: line + 1, column: column + 1 });
    },
  }, { allowTrailingComma: true });
  const value: unknown = parse(input, [], { allowTrailingComma: true });
  inspectConfigDocument(value);
  return value;
}
