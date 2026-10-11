import { createHash } from 'node:crypto';
import { gatherExport } from '../export/collect.js';
import type { ExportEntry } from '../export/model.js';
import { redactExportText } from '../../core/security/redaction.js';
import { isRecord } from '../../core/values/record.js';

export const HISTORY_LIMITS = { bytes: 2 * 1024 * 1024, entries: 4096, text: 256 * 1024, id: 256 } as const;
export interface HistoryNode {
  readonly id: string;
  readonly parentId?: string;
  readonly kind: 'session-root' | 'turn-message' | 'command-output';
}
export interface HistoryEntry {
  readonly id: string;
  readonly role: 'user' | 'assistant' | 'system' | 'tool' | 'command';
  readonly content: string;
  readonly timestamp: string;
  readonly toolCalls?: ExportEntry['toolCalls'];
  readonly toolCallId?: string;
}
export interface HistoryDocument {
  readonly kind: 'session-history';
  readonly version: 1;
  readonly sourceId: string;
  readonly title: string;
  readonly leafId: string;
  readonly nodes: readonly HistoryNode[];
  readonly entries: readonly HistoryEntry[];
}

/** Export the existing sanitized graph, never credentials, approval metadata or reasoning. */
export function exportHistory(sessionId: string, workspace: string, title = 'Imported conversation'): string {
  const result = gatherExport({ sessionId, workspace, maxSourceBytes: HISTORY_LIMITS.bytes });
  if (!result.ok) throw new Error(result.reason);
  const { payload } = result;
  if (payload.warnings.length || !payload.leafId) throw new Error('Incomplete history cannot be exported as a complete versioned graph. Inspect /tree and /export first.');
  const document: HistoryDocument = { kind: 'session-history', version: 1, sourceId: sessionId,
    title: redactExportText(title).replace(/[\x00-\x1f\x7f-\x9f]/g, ' ').slice(0, 512), leafId: payload.leafId,
    nodes: payload.tree.map(node => ({ id: node.id, ...(node.parentId ? { parentId: node.parentId } : {}), kind: node.kind as HistoryNode['kind'] })),
    entries: payload.entries.map(entry => ({ id: entry.id, role: entry.role as HistoryEntry['role'], content: entry.content,
      timestamp: entry.timestamp ?? payload.header.exportedAt, ...(entry.toolCalls ? { toolCalls: entry.toolCalls } : {}),
      ...(entry.toolCallId !== undefined ? { toolCallId: entry.toolCallId } : {}) })),
  };
  const content = JSON.stringify(document, null, 2) + '\n';
  parseHistory(content);
  return content;
}

export function parseHistory(content: string): HistoryDocument {
  if (Buffer.byteLength(content) > HISTORY_LIMITS.bytes) throw new Error('History import exceeds 2 MiB.');
  let value: unknown;
  try { value = JSON.parse(content); } catch { throw new Error('History import requires valid JSON.'); }
  requireShape(isRecord(value) && onlyKeys(value, ['kind', 'version', 'sourceId', 'title', 'leafId', 'nodes', 'entries']));
  const data = value as unknown as HistoryDocument;
  requireShape(data.kind === 'session-history' && data.version === 1 && validId(data.sourceId) && validId(data.leafId)
    && typeof data.title === 'string' && data.title.length <= 512 && !/[\x00-\x1f\x7f-\x9f]/.test(data.title)
    && Array.isArray(data.nodes) && data.nodes.length > 0 && data.nodes.length <= HISTORY_LIMITS.entries
    && Array.isArray(data.entries) && data.entries.length > 0 && data.entries.length <= HISTORY_LIMITS.entries);
  const nodes = new Map<string, HistoryNode>();
  for (const node of data.nodes) {
    const raw = node as unknown;
    requireShape(isRecord(raw) && onlyKeys(raw, ['id', 'parentId', 'kind']) && validId(raw.id) && !nodes.has(raw.id)
      && typeof raw.kind === 'string' && ['session-root', 'turn-message', 'command-output'].includes(raw.kind)
      && (raw.parentId === undefined || validId(raw.parentId)));
    const validNode = raw as unknown as HistoryNode;
    nodes.set(validNode.id, validNode);
  }
  const roots = data.nodes.filter(node => node.parentId === undefined);
  requireShape(roots.length === 1 && data.nodes.filter(node => node.kind === 'session-root').length === 1
    && roots[0]!.kind === 'session-root' && nodes.has(data.leafId) && nodes.get(data.leafId)!.kind !== 'command-output');
  for (const node of data.nodes) {
    const seen = new Set<string>(); let cursor: HistoryNode | undefined = node;
    while (cursor?.parentId) {
      requireShape(!seen.has(cursor.id)); seen.add(cursor.id);
      cursor = nodes.get(cursor.parentId);
      requireShape(cursor !== undefined && cursor.kind !== 'command-output');
    }
  }
  const ids = new Set<string>();
  for (const entry of data.entries) {
    validateEntry(entry);
    requireShape(!ids.has(entry.id) && nodes.get(entry.id)?.kind === (entry.role === 'command' ? 'command-output' : 'turn-message'));
    ids.add(entry.id);
  }
  requireShape(data.nodes.every(node => node.kind === 'session-root' || ids.has(node.id)));
  validateToolHistory(data, nodes);
  return data;
}

export function historyDigest(document: HistoryDocument): string {
  return createHash('sha256').update(JSON.stringify(document)).digest('hex');
}

function validateEntry(entry: HistoryEntry): void {
  requireShape(isRecord(entry) && onlyKeys(entry, ['id', 'role', 'content', 'timestamp', 'toolCalls', 'toolCallId']) && validId(entry.id)
    && ['user', 'assistant', 'system', 'tool', 'command'].includes(entry.role) && typeof entry.content === 'string'
    && Buffer.byteLength(entry.content) <= HISTORY_LIMITS.text && typeof entry.timestamp === 'string' && Number.isFinite(Date.parse(entry.timestamp)));
  requireShape(entry.role === 'tool' ? validId(entry.toolCallId) : entry.toolCallId === undefined);
  if (entry.toolCalls !== undefined) requireShape(entry.role === 'assistant' && Array.isArray(entry.toolCalls) && entry.toolCalls.length <= 64
    && entry.toolCalls.every(call => isRecord(call) && onlyKeys(call, ['id', 'name', 'arguments']) && validId(call.id)
      && typeof call.name === 'string' && /^[\w.-]{1,128}$/.test(call.name) && typeof call.arguments === 'string'
      && Buffer.byteLength(call.arguments) <= HISTORY_LIMITS.text));
}

/** Validate each branch independently, including inactive branches that can be resumed later. */
function validateToolHistory(data: HistoryDocument, nodes: ReadonlyMap<string, HistoryNode>): void {
  const entries = new Map(data.entries.map(entry => [entry.id, entry]));
  const children = new Map<string, HistoryNode[]>();
  const callIds = new Set<string>();
  for (const node of data.nodes) {
    if (node.parentId) {
      const siblings = children.get(node.parentId) ?? [];
      siblings.push(node); children.set(node.parentId, siblings);
    }
    for (const call of entries.get(node.id)?.toolCalls ?? []) {
      requireShape(!callIds.has(call.id)); callIds.add(call.id);
    }
  }
  const root = data.nodes.find(node => node.kind === 'session-root')!;
  const queue = [{ node: root, pending: new Set<string>() }];
  for (let position = 0; position < queue.length; position++) {
    const { node, pending: previous } = queue[position]!;
    const pending = new Set(previous);
    const entry = entries.get(node.id);
    if (entry && entry.role !== 'command') {
      if (entry.role === 'tool') {
        requireShape(pending.delete(entry.toolCallId!));
      } else {
        requireShape(pending.size === 0);
        for (const call of entry.toolCalls ?? []) pending.add(call.id);
      }
    }
    const next = (children.get(node.id) ?? []).filter(child => child.kind !== 'command-output');
    // A leaf at a pending call is incomplete, even if its other branch has results.
    if (!next.length || node.id === data.leafId) requireShape(pending.size === 0);
    for (const child of next) { requireShape(nodes.has(child.id)); queue.push({ node: child, pending }); }
  }
}
function validId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= HISTORY_LIMITS.id && !/[\x00-\x20\x7f-\x9f]/.test(value);
}
function onlyKeys(value: object, keys: readonly string[]): boolean { return Object.keys(value).every(key => keys.includes(key)); }
function requireShape(condition: unknown): asserts condition {
  if (!condition) throw new Error('History import requires a bounded session-history version 1 document with a complete, unambiguous graph.');
}
