import { isThinkingPreference } from '../../core/models/effort.js';
import { sameValue } from '../../config/values.js';
import { isRecord } from '../../core/values/record.js';
import type { BoundSessionScope } from '../../session/store/contract.js';
import type { HandoffState } from './model.js';

const phases = new Set(['armed', 'running', 'switched', 'completed', 'failed', 'cancelled', 'unknown']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function text(value: unknown, limit = 512): value is string {
  return typeof value === 'string' && value.length > 0 && Buffer.byteLength(value) <= limit && !/[\x00-\x1f\x7f-\x9f]/.test(value);
}
function choice(value: unknown): boolean {
  return isRecord(value) && text(value.provider) && text(value.model) && isThinkingPreference(value.thinkingEffort)
    && (value.connectionId === undefined || text(value.connectionId));
}
export function decodeHandoffs(value: unknown, scope: BoundSessionScope): HandoffState {
  if (value === undefined) return { version: 1, revision: 0, cycles: [] };
  if (!isRecord(value) || value.version !== 1 || !Number.isSafeInteger(value.revision) || Number(value.revision) < 0
    || !Array.isArray(value.cycles) || value.cycles.length > 16 || Buffer.byteLength(JSON.stringify(value)) > 65536) throw new Error('Handoff state is invalid or exceeds retention limits.');
  const ids = new Set<string>(); let unresolved = 0;
  for (const row of value.cycles) {
    if (!isRecord(row) || typeof row.id !== 'string' || !uuid.test(row.id) || ids.has(row.id) || !sameValue(row.scope, scope)
      || !isRecord(row.directory) || !text(row.directory.path, 16384) || !text(row.directory.identity)
      || !choice(row.source) || !choice(row.target) || (row.source as Record<string, unknown>).provider !== (row.target as Record<string, unknown>).provider
      || (row.modelRevision !== undefined && !text(row.modelRevision)) || !Number.isSafeInteger(row.createdAt) || Number(row.createdAt) < 0
      || typeof row.phase !== 'string' || !phases.has(row.phase)
      || (row.runId !== undefined && (typeof row.runId !== 'string' || !uuid.test(row.runId)))
      || (row.promptEntryId !== undefined && !text(row.promptEntryId)) || (row.switchedBy !== undefined && !text(row.switchedBy))
      || (row.endedAt !== undefined && (!Number.isSafeInteger(row.endedAt) || Number(row.endedAt) < Number(row.createdAt)))
      || (row.phase === 'armed' && (row.runId !== undefined || row.switchedBy !== undefined || row.endedAt !== undefined))
      || (['running', 'switched'].includes(row.phase) && (!row.runId || row.endedAt !== undefined))
      || (row.phase === 'switched' && !row.switchedBy) || (row.switchedBy !== undefined && !row.runId)) throw new Error('Handoff state is invalid or detached.');
    if (row.retired !== undefined && (row.retired !== true || row.phase !== 'unknown')) throw new Error('Only an uncertain handoff may retire its selection.');
    ids.add(row.id); if (!row.retired && ['armed', 'running', 'switched', 'unknown'].includes(row.phase)) unresolved++;
  }
  if (unresolved > 1) throw new Error('Multiple unresolved handoffs are invalid.');
  return structuredClone(value) as unknown as HandoffState;
}
