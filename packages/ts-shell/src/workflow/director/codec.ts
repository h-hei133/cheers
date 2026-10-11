import { isRecord } from '../../core/values/record.js';
import { isThinkingPreference } from '../../core/models/effort.js';
import type { BoundSessionScope } from '../../session/store/contract.js';
import { validateScope } from '../jobs/validation.js';
import type { DirectorState } from './model.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function text(value: unknown, limit = 512): value is string {
  return typeof value === 'string' && Boolean(value) && Buffer.byteLength(value) <= limit && !/[\x00-\x1f\x7f-\x9f]/.test(value);
}
function choice(value: unknown): boolean {
  return isRecord(value) && Object.keys(value).every(key => ['provider', 'model', 'thinkingEffort', 'connectionId'].includes(key))
    && text(value.provider) && text(value.model) && isThinkingPreference(value.thinkingEffort)
    && (value.connectionId === undefined || text(value.connectionId));
}
export function decodeDirectors(value: unknown, scope: BoundSessionScope): DirectorState {
  if (value === undefined) return { version: 1, revision: 0, cycles: [] };
  if (!isRecord(value) || value.version !== 1 || !Number.isSafeInteger(value.revision) || Number(value.revision) < 0
    || !Array.isArray(value.cycles) || value.cycles.length > 16 || Buffer.byteLength(JSON.stringify(value)) > 65536)
    throw new Error('Director state is invalid or exceeds retention limits.');
  const ids = new Set<string>(); const workers = new Set<string>(); let active = 0;
  for (const row of value.cycles) {
    if (!isRecord(row) || Object.keys(row).some(key => !['id', 'scope', 'directory', 'source', 'worker', 'modelRevision', 'createdAt', 'phase', 'workers', 'endedAt', 'retired'].includes(key))
      || !uuid.test(String(row.id)) || ids.has(String(row.id))
      || !isRecord(row.directory) || !text(row.directory.path, 16384) || !text(row.directory.identity)
      || !choice(row.source) || !choice(row.worker) || (row.source as Record<string, unknown>).provider !== (row.worker as Record<string, unknown>).provider
      || (row.modelRevision !== undefined && !text(row.modelRevision)) || !Number.isSafeInteger(row.createdAt) || Number(row.createdAt) < 0
      || !['enabled', 'stopping', 'disabled', 'unknown'].includes(String(row.phase)) || !Array.isArray(row.workers) || row.workers.length > 16
      || (row.endedAt !== undefined && (!Number.isSafeInteger(row.endedAt) || Number(row.endedAt) < Number(row.createdAt)))
      || (['enabled', 'stopping'].includes(String(row.phase)) && row.endedAt !== undefined)
      || (row.phase === 'disabled' && row.endedAt === undefined)
      || (row.retired !== undefined && (row.retired !== true || row.phase !== 'unknown'))) throw new Error('Director state is invalid or detached.');
    validateScope(row.scope, scope);
    for (const id of row.workers) {
      if (typeof id !== 'string' || !uuid.test(id) || workers.has(id)) throw new Error('Director worker identity is invalid or duplicated.');
      workers.add(id);
    }
    ids.add(String(row.id)); if (!row.retired && row.phase !== 'disabled') active++;
  }
  if (active > 1) throw new Error('Multiple active director selections are invalid.');
  return structuredClone(value) as unknown as DirectorState;
}
