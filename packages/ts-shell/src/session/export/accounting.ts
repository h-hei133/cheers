import { decodeRequestLedger } from '../../core/agent/request/codec.js';
import { decodeUsageSnapshot } from '../../observability/usage/snapshot.js';
import { estimateSessionCost } from '../../observability/usageTelemetry.js';
import type { SessionUsageSnapshot } from '../../observability/usage/model.js';
import type { LedgerBinding } from '../../core/agent/request/model.js';
import type { ExportAccounting } from './model.js';

export function projectExportAccounting(
  state: { readonly usage?: unknown; readonly requestLedger?: unknown } | undefined,
  binding?: LedgerBinding,
): ExportAccounting {
  const usage = projectRecordedUsage(state?.usage);
  const requestCoverage = projectRequestCoverage(state?.requestLedger, binding);
  return { scope: 'session', ...usage, requestCoverage,
    status: usage.usageStatus === 'unavailable' ? 'unavailable'
      : usage.usageStatus === 'partial' || requestCoverage.status !== 'tracked' ? 'partial' : 'recorded' };
}

function projectRecordedUsage(raw: unknown): Omit<ExportAccounting, 'scope' | 'status' | 'requestCoverage'> {
  let usage: SessionUsageSnapshot | undefined;
  try { usage = decodeUsageSnapshot(raw); } catch { return { usageStatus: 'unavailable' }; }
  if (!usage) return { usageStatus: 'unavailable' };
  const buckets = Object.values(usage.byModel);
  if (buckets.length === 0) return { usageStatus: 'unavailable' };
  if (buckets.some(bucket => [bucket.promptTokens, bucket.completionTokens, bucket.cacheReadTokens,
    bucket.cacheWriteTokens, bucket.totalTokens, bucket.turnsCount].some(count => !Number.isSafeInteger(count)))) {
    return { usageStatus: 'unavailable' };
  }
  const total = buckets.reduce((sum, bucket) => sum + bucket.totalTokens, 0);
  const requests = buckets.reduce((sum, bucket) => sum + bucket.turnsCount, 0);
  const allocated = buckets.every(bucket => !bucket.allocationIncomplete
    && bucket.totalTokens === bucket.promptTokens + bucket.completionTokens + bucket.cacheReadTokens + bucket.cacheWriteTokens);
  if (!Number.isSafeInteger(total) || !Number.isSafeInteger(requests)) return { usageStatus: 'unavailable' };
  const known = !usage.usageHealth && allocated;
  const tokens = known ? {
    input: buckets.reduce((sum, bucket) => sum + bucket.promptTokens + bucket.cacheReadTokens + bucket.cacheWriteTokens, 0),
    output: buckets.reduce((sum, bucket) => sum + bucket.completionTokens, 0),
    cacheRead: buckets.reduce((sum, bucket) => sum + bucket.cacheReadTokens, 0),
    cacheWrite: buckets.reduce((sum, bucket) => sum + bucket.cacheWriteTokens, 0),
    total,
  } : { total };
  // Legacy prices and current catalogue prices cannot establish what these requests cost.
  const capturedPrices = buckets.every(bucket => bucket.attribution?.rates !== null && bucket.attribution?.rates !== undefined);
  const estimate = known && capturedPrices ? estimateSessionCost({ ...usage,
    lastPromptTokens: undefined, lastPromptMessageCount: 0 }, () => undefined) : undefined;
  return { usageStatus: known ? 'recorded' : 'partial', recordedRequests: requests, tokens,
    ...(estimate && !estimate.partial && estimate.everyRatePublished && Number.isFinite(estimate.cost)
      ? { estimatedCostUsd: estimate.cost } : {}) };
}

function projectRequestCoverage(raw: unknown, binding?: LedgerBinding): ExportAccounting['requestCoverage'] {
  let ledger;
  try { ledger = decodeRequestLedger(raw); } catch { return { status: 'unavailable' }; }
  if (!ledger || !binding || ledger.sessionId !== binding.sessionId || ledger.sessionCreatedAt !== binding.sessionCreatedAt
    || ledger.directoryIdentity !== binding.directoryIdentity) return { status: 'unavailable' };
  const scopes = Object.values(ledger.scopes);
  if (scopes.length === 0) return { status: 'unavailable' };
  const attempts = scopes.flatMap(scope => Object.values(scope.pending));
  const unknown = attempts.filter(attempt => attempt.dispatched);
  const historyUnknown = scopes.some(scope => scope.historyUnknown);
  const breach = scopes.some(scope => scope.breach !== undefined);
  const input = unknown.filter(attempt => !attempt.usage?.inconsistent && attempt.usage?.inputTokens !== undefined);
  const output = unknown.filter(attempt => !attempt.usage?.inconsistent && attempt.usage?.outputTokens !== undefined);
  const knownInput = input.reduce((sum, attempt) => sum + attempt.usage!.inputTokens!, 0);
  const knownOutput = output.reduce((sum, attempt) => sum + attempt.usage!.outputTokens!, 0);
  const hasInput = input.length > 0 && Number.isSafeInteger(knownInput);
  const hasOutput = output.length > 0 && Number.isSafeInteger(knownOutput);
  return { status: unknown.length > 0 || historyUnknown || breach ? 'partial' : 'tracked', scopeCount: scopes.length,
    pending: attempts.length, dispatchedUnknown: unknown.length, historyUnknown, breach,
    ...(hasInput || hasOutput ? { knownPartialTokens: {
      ...(hasInput ? { input: knownInput } : {}),
      ...(hasOutput ? { output: knownOutput } : {}),
    } } : {}) };
}
