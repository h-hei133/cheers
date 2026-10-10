import { hashText, integer, keys, object, requireValue, text } from './value.js';
import { SNAPSHOT_BYTES, type Snapshot, type RelayEvent, type EventKind } from './model.js';
import { redactExportText } from '../../core/security/redaction.js';
import type { ExportPayload } from '../../session/export/model.js';

const roles = ['user', 'assistant', 'tool', 'system', 'command'];
const kinds: readonly EventKind[] = ['query.started', 'turn.started', 'turn.completed', 'tool.started', 'tool.settled',
  'approval.requested', 'approval.approved', 'approval.denied', 'query.completed', 'query.failed', 'lifecycle.cancelled', 'lifecycle.error', 'relay.gap'];

/** Only complete, scrubbed text is disclosed. Large text is omitted as a whole. */
export function projectSnapshot(payload: ExportPayload, cutover: number): Snapshot {
  const result: Snapshot = { version: 1, consistency: 'partial', cutover, entries: [],
    warnings: ['Transcript and branch state are separate sources; active output and opaque attachments are omitted.'] };
  for (const entry of payload.entries) {
    if (result.entries.length >= 256) { result.warnings.push('Older or additional entries omitted at the 256 entry limit.'); break; }
    const content = redactExportText(entry.content);
    const projected = { id: hashText(entry.id), role: (roles.includes(entry.role) ? entry.role : 'command') as Snapshot['entries'][number]['role'],
      content: Buffer.byteLength(content) <= 32 * 1024 ? content : '[Complete message omitted: text exceeds 32 KiB.]' };
    if (Buffer.byteLength(JSON.stringify(result)) + Buffer.byteLength(JSON.stringify(projected)) > SNAPSHOT_BYTES - 2048) {
      result.warnings.push('Additional entries omitted at the snapshot byte limit.'); break;
    }
    result.entries.push(projected);
  }
  if (payload.warnings.length) result.warnings.push('Source acquisition reported incomplete or damaged history.');
  return decodeSnapshot(result);
}

/** Reconstruct a text-only DTO; incoming HTML, blobs and arbitrary metadata are refused. */
export function decodeSnapshot(value: unknown): Snapshot {
  const record = object(value); keys(record, ['version', 'consistency', 'cutover', 'entries', 'warnings']);
  requireValue(record.version === 1 && record.consistency === 'partial' && Buffer.byteLength(JSON.stringify(value)) <= SNAPSHOT_BYTES);
  requireValue(Array.isArray(record.entries) && record.entries.length <= 256 && Array.isArray(record.warnings) && record.warnings.length <= 16);
  const entries = record.entries.map(item => {
    const entry = object(item); keys(entry, ['id', 'role', 'content']);
    const id = text(entry.id, 64); requireValue(/^[a-f0-9]{64}$/.test(id) && roles.includes(String(entry.role)));
    requireValue(typeof entry.content === 'string' && Buffer.byteLength(entry.content) <= 32 * 1024);
    return { id, role: entry.role as Snapshot['entries'][number]['role'], content: redactExportText(entry.content) };
  });
  requireValue(new Set(entries.map(entry => entry.id)).size === entries.length);
  return { version: 1, consistency: 'partial', cutover: integer(record.cutover), entries,
    warnings: record.warnings.map(warning => redactExportText(text(warning, 512))) };
}
export function decodeEvents(value: unknown): RelayEvent[] {
  requireValue(Array.isArray(value) && value.length <= 128);
  return value.map(item => { const event = object(item); keys(event, ['sequence', 'kind', 'timestamp']);
    requireValue(kinds.includes(event.kind as EventKind));
    return { sequence: integer(event.sequence, 1), kind: event.kind as EventKind, timestamp: integer(event.timestamp) }; });
}
