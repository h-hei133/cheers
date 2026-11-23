import { parse, visit } from 'jsonc-parser';
import path from 'node:path';
import { isAlias, isMap, isScalar, isSeq, LineCounter, parseDocument, type ParsedNode } from 'yaml';

export const CONFIG_MAX_BYTES = 1024 * 1024;
const MAX_DEPTH = 32;
const MAX_NODES = 50_000;
const MAX_YAML_ALIASES = 100;
const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor']);
const YAML_CORE_TAGS = new Set(['str', 'int', 'float', 'bool', 'null', 'map', 'seq']);

/** Only controlled codes cross the config diagnostic boundary. */
export class ConfigDocumentError extends Error {
  constructor(readonly code: 'invalid-json' | 'invalid-yaml' | 'invalid-document' | 'resource-limit' | 'unsafe-key' | 'unsupported-version' | 'unreadable' | 'duplicate-key' | 'invalid-number' | 'invalid-utf8' | 'edit-mismatch' | 'content-changed', readonly position?: { offset: number; line: number; column: number }, readonly filePath?: string) {
    const location = filePath
      ? position ? `${filePath}:${position.line}:${position.column}: ` : `${filePath}: `
      : '';
    const source = filePath && position
      ? `\n ${String(position.line).padStart(3)} | <source content omitted>\n     | ${' '.repeat(Math.max(0, position.column - 1))}^`
      : '';
    super(`${location}${code}${position ? ` at line ${position.line}, column ${position.column}` : ''}${source}`);
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
export function parseConfigText(text: string, options: { readonly allowDuplicateTopLevel?: readonly string[] } = {}): Record<string, unknown> {
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
      if (keys.has(key) && !(parents.length === 1 && options.allowDuplicateTopLevel?.includes(key))) throw new ConfigDocumentError('duplicate-key', position);
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

/** File extensions select syntax while callers keep their existing file owners. */
export function configFormatForPath(filePath: string): 'jsonc' | 'yaml' {
  const extension = path.extname(filePath).toLowerCase();
  return extension === '.yaml' || extension === '.yml' ? 'yaml' : 'jsonc';
}

/** Read one bounded human-editable document without exposing source text in errors. */
export function parseConfigFileText(filePath: string, text: string, options: { readonly allowDuplicateTopLevel?: readonly string[] } = {}): Record<string, unknown> {
  return configFormatForPath(filePath) === 'yaml' ? parseYamlConfigText(text) : parseConfigText(text, options);
}

function parseYamlConfigText(text: string): Record<string, unknown> {
  if (Buffer.byteLength(text) > CONFIG_MAX_BYTES) throw new ConfigDocumentError('resource-limit');
  const lineCounter = new LineCounter();
  const document = parseDocument(text, {
    version: '1.2', schema: 'core', resolveKnownTags: false, merge: false,
    stringKeys: true, uniqueKeys: true, lineCounter, prettyErrors: false,
  });
  const bomOffset = text.startsWith('\uFEFF') ? 1 : 0;
  if (document.directives?.yaml.explicit && document.directives.yaml.version !== '1.2') {
    throw new ConfigDocumentError('unsupported-version', { offset: 0, line: 1, column: 1 });
  }
  const failure = document.errors[0] ?? document.warnings[0];
  if (failure) {
    const code = failure.code === 'DUPLICATE_KEY' ? 'duplicate-key'
      : failure.code === 'RESOURCE_EXHAUSTION' ? 'resource-limit' : 'invalid-yaml';
    throw new ConfigDocumentError(code, yamlPosition(failure.pos[0], lineCounter, bomOffset));
  }
  if (!isMap(document.contents)) {
    const offset = document.contents?.range?.[0] ?? 0;
    throw new ConfigDocumentError('invalid-document', yamlPosition(offset, lineCounter, bomOffset));
  }

  const pending: { node: ParsedNode; depth: number }[] = [{ node: document.contents, depth: 0 }];
  let nodes = 0;
  let aliases = 0;
  while (pending.length) {
    const entry = pending.pop()!;
    if (++nodes > MAX_NODES || entry.depth > MAX_DEPTH) throw new ConfigDocumentError('resource-limit');
    const range = entry.node.range;
    if ('tag' in entry.node && entry.node.tag) {
      const tag = entry.node.tag.startsWith('tag:yaml.org,2002:') ? entry.node.tag.slice('tag:yaml.org,2002:'.length) : undefined;
      if (!tag || !YAML_CORE_TAGS.has(tag)) {
        const offset = range?.[0] ?? 0;
        throw new ConfigDocumentError('invalid-yaml', yamlPosition(offset, lineCounter, bomOffset));
      }
    }
    if (isAlias(entry.node)) {
      if (++aliases > MAX_YAML_ALIASES) throw new ConfigDocumentError('resource-limit');
      continue;
    }
    if (isMap(entry.node)) {
      const keys = new Set<string>();
      for (const pair of entry.node.items) {
        if (!isScalar(pair.key) || typeof pair.key.value !== 'string') {
          const offset = pair.key && 'range' in pair.key && pair.key.range ? pair.key.range[0] : range?.[0] ?? 0;
          throw new ConfigDocumentError('invalid-yaml', yamlPosition(offset, lineCounter, bomOffset));
        }
        const key = pair.key.value;
        if (forbiddenKeys.has(key)) {
          const offset = pair.key.range?.[0] ?? range?.[0] ?? 0;
          throw new ConfigDocumentError('unsafe-key', yamlPosition(offset, lineCounter, bomOffset));
        }
        if (keys.has(key)) {
          const offset = pair.key.range?.[0] ?? range?.[0] ?? 0;
          throw new ConfigDocumentError('duplicate-key', yamlPosition(offset, lineCounter, bomOffset));
        }
        keys.add(key);
        if (pair.value) pending.push({ node: pair.value, depth: entry.depth + 1 });
      }
    } else if (isSeq(entry.node)) {
      for (const item of entry.node.items) pending.push({ node: item, depth: entry.depth + 1 });
    }
  }

  let value: unknown;
  try { value = document.toJS({ maxAliasCount: MAX_YAML_ALIASES }); }
  catch { throw new ConfigDocumentError('invalid-yaml'); }
  inspectConfigDocument(value);
  return value;
}

function yamlPosition(offset: number, lineCounter: LineCounter, bomOffset: number): { offset: number; line: number; column: number } {
  const position = lineCounter.linePos(offset);
  const hiddenBom = bomOffset > 0 && position.line === 1 ? 1 : 0;
  return { offset, line: position.line, column: Math.max(1, position.col - hiddenBom) };
}
