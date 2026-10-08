import { isRecord } from '../../values/record.js';
import { freezeDeep } from '../../values/freeze.js';
import type { ModelUsage, PendingAttempt, RequestBound, RequestLedger, ScopeLedger } from './model.js';
import { finalizedSequence } from './ranges.js';

export function decodeRequestLedger(value: unknown): RequestLedger | undefined {
  if (!isRecord(value) || value.schemaVersion !== 1 || value.meteringVersion !== 1 || !text(value.sessionId)
    || !text(value.sessionCreatedAt) || !text(value.directoryIdentity) || !isRecord(value.scopes)) return undefined;
  for (const [id, scope] of Object.entries(value.scopes)) if (!validScope(scope, id)) return undefined;
  return freezeDeep(structuredClone(value)) as unknown as RequestLedger;
}

export function validModelUsage(value: unknown): value is ModelUsage {
  if (!isRecord(value) || value.version !== 1 || typeof value.complete !== 'boolean') return false;
  if (value.inconsistent !== undefined && typeof value.inconsistent !== 'boolean') return false;
  if (['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'reportedTotalTokens'].some(key => value[key] !== undefined && !count(value[key]))) return false;
  return !value.complete || (count(value.inputTokens) && count(value.outputTokens)
    && Number.isSafeInteger((value.inputTokens as number) + (value.outputTokens as number))
    && (value.cacheReadTokens === undefined || (value.cacheReadTokens as number) <= (value.inputTokens as number))
    && (value.cacheWriteTokens === undefined || (value.cacheWriteTokens as number) <= (value.inputTokens as number)));
}

export function validRequestBound(value: unknown): value is RequestBound {
  return isRecord(value) && count(value.inputTokens) && count(value.outputTokens) && text(value.source) && text(value.version)
    && Number.isSafeInteger((value.inputTokens as number) + (value.outputTokens as number));
}

function validScope(value: unknown, id: string): value is ScopeLedger {
  if (!text(id) || !isRecord(value) || !isRecord(value.scope) || value.scope.id !== id
    || !text(value.scope.workspacePath) || !text(value.scope.workspaceIdentity) || !count(value.nextSequence) || value.nextSequence < 1
    || !Array.isArray(value.finalized) || !isRecord(value.pending) || typeof value.historyUnknown !== 'boolean'
    || ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens'].some(key => !count(value[key]))) return false;
  let previous = 0; let finalizedCount = 0;
  for (const range of value.finalized) {
    if (!Array.isArray(range) || range.length !== 2 || !count(range[0]) || !count(range[1]) || range[0] < 1
      || range[0] <= previous || range[1] < range[0] || range[1] >= value.nextSequence) return false;
    previous = range[1] + 1; finalizedCount += range[1] - range[0] + 1;
  }
  for (const [key, attempt] of Object.entries(value.pending)) {
    const sequence = Number(key);
    if (String(sequence) !== key || !count(sequence) || sequence < 1 || sequence >= value.nextSequence
      || !validAttempt(attempt, sequence) || finalizedSequence(value.finalized, sequence)) return false;
  }
  if (finalizedCount + Object.keys(value.pending).length !== value.nextSequence - 1) return false;
  const breach = value.breach;
  return breach === undefined || (isRecord(breach) && count(breach.sequence) && breach.sequence >= 1
    && breach.sequence < value.nextSequence && count(breach.actualTokens) && count(breach.boundTokens));
}

function validAttempt(value: unknown, sequence: number): value is PendingAttempt {
  return isRecord(value) && value.sequence === sequence && typeof value.dispatched === 'boolean' && text(value.requestId)
    && typeof value.bodyDigest === 'string' && /^[a-f0-9]{64}$/.test(value.bodyDigest)
    && typeof value.provider === 'string' && text(value.model) && text(value.endpoint) && text(value.purpose)
    && (value.bound === undefined || validRequestBound(value.bound)) && (value.usage === undefined || validModelUsage(value.usage));
}

function count(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0; }
function text(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && value.length <= 16_384; }
