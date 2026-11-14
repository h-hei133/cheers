import { describe, expect, it } from 'vitest';
import { createRequestLedger, dispatchRequest, initializeRequestScope, reserveRequest, settleRequest } from '../../core/agent/request/ledger.js';
import type { ModelUsage, RequestLedger } from '../../core/agent/request/model.js';
import type { ModelCostRates } from '../../core/models/catalog.js';
import { attributedBucketKey, captureUsageAttribution } from '../../observability/usage/identity.js';
import type { SessionUsageSnapshot } from '../../observability/usage/model.js';
import { projectExportAccounting } from './accounting.js';

const binding = { sessionId: 'sess_accounting', sessionCreatedAt: '2026-09-25T00:00:00.000Z', directoryIdentity: '1:2:3' };
const scope = { id: 'workspace', workspacePath: '/workspace', workspaceIdentity: 'workspace-identity' };
const rates = { promptPerMTok: 3, completionPerMTok: 6, cacheReadPerMTok: 1, cacheWritePerMTok: 2 };

function snapshot(prices: ModelCostRates | null = rates): SessionUsageSnapshot {
  const attribution = captureUsageAttribution({ provider: 'fixture', model: 'recorded', baseUrl: 'https://provider.invalid', rates: prices ?? undefined });
  const key = attributedBucketKey(attribution);
  return { schemaVersion: 2, byModel: { [key]: { attribution, promptTokens: 40, completionTokens: 30,
    cacheReadTokens: 50, cacheWriteTokens: 10, totalTokens: 130, turnsCount: 1 } }, turnsCount: 1,
    toolCallsCount: 0, lastBucketKey: key, lastUpdated: 1, recentRequests: [] };
}

function trackedLedger(): RequestLedger {
  return initializeRequestScope(createRequestLedger(binding), scope, false);
}

function dispatched(ledger: RequestLedger, usage?: ModelUsage): RequestLedger {
  const reserved = reserveRequest(ledger, scope.id, { requestId: 'PRIVATE_REQUEST_ID', bodyDigest: 'a'.repeat(64),
    provider: 'fixture', model: 'recorded', endpoint: 'https://provider.invalid/PRIVATE_ENDPOINT',
    purpose: 'answer', credentialId: 'PRIVATE_CREDENTIAL_ID' });
  return settleRequest(dispatchRequest(reserved.ledger, scope.id, reserved.value), scope.id, reserved.value, usage);
}

describe('export accounting projection', () => {
  it('uses exclusive billing buckets once and estimates only their captured prices', () => {
    const result = projectExportAccounting({ usage: snapshot(), requestLedger: trackedLedger() }, binding);
    expect(result).toMatchObject({ scope: 'session', status: 'recorded', usageStatus: 'recorded', recordedRequests: 1,
      tokens: { input: 100, output: 30, cacheRead: 50, cacheWrite: 10, total: 130 },
      requestCoverage: { status: 'tracked', scopeCount: 1, pending: 0, dispatchedUnknown: 0, historyUnknown: false, breach: false } });
    expect(result.estimatedCostUsd).toBeCloseTo(0.00037);
  });

  it('never adds settled inclusive ledger usage to billing buckets', () => {
    const ledger = dispatched(trackedLedger(), { version: 1, inputTokens: 100, outputTokens: 30,
      cacheReadTokens: 50, cacheWriteTokens: 10, complete: true });
    expect(projectExportAccounting({ usage: snapshot(), requestLedger: ledger }, binding).tokens?.total).toBe(130);
  });

  it.each([undefined, {}, { byModel: {} }, null])('keeps missing or malformed usage unavailable: %j', usage => {
    expect(projectExportAccounting({ usage })).toEqual({ scope: 'session', status: 'unavailable', usageStatus: 'unavailable',
      requestCoverage: { status: 'unavailable' } });
  });

  it('keeps a valid empty snapshot unavailable instead of recording zero usage', () => {
    const usage = { ...snapshot(), byModel: {}, turnsCount: 0, lastBucketKey: '' };
    expect(projectExportAccounting({ usage }).tokens).toBeUndefined();
    expect(projectExportAccounting({ usage }).usageStatus).toBe('unavailable');
  });

  it.each(['fractional', 'unsafe', 'invalid'] as const)('does not export %s bucket counts', fault => {
    const usage = snapshot();
    const bucket = Object.values(usage.byModel)[0]!;
    bucket.promptTokens = fault === 'fractional' ? 40.5 : fault === 'unsafe' ? Number.MAX_SAFE_INTEGER + 1 : -1;
    expect(projectExportAccounting({ usage }).usageStatus).toBe('unavailable');
  });

  it('refuses unsafe cumulative totals across otherwise valid buckets', () => {
    const usage = snapshot();
    const bucket = { promptTokens: Number.MAX_SAFE_INTEGER, completionTokens: 0, cacheReadTokens: 0,
      cacheWriteTokens: 0, totalTokens: Number.MAX_SAFE_INTEGER, turnsCount: 1 };
    const result = projectExportAccounting({ usage: { ...usage, byModel: { first: bucket, second: bucket }, lastBucketKey: '' } });
    expect(result.usageStatus).toBe('unavailable');
    expect(result).not.toHaveProperty('tokens');
  });

  it('retains only recorded total when categories do not establish allocation', () => {
    const usage = snapshot();
    Object.values(usage.byModel)[0]!.totalTokens = 200;
    expect(projectExportAccounting({ usage })).toEqual({ scope: 'session', status: 'partial', usageStatus: 'partial',
      recordedRequests: 1, tokens: { total: 200 }, requestCoverage: { status: 'unavailable' } });
  });

  it('does not label recovered accounting gaps as fully allocated or priced', () => {
    const usage = { ...snapshot(), usageHealth: { status: 'degraded' as const, rejectedBuckets: 1,
      rejectedHistoryEntries: 0, invalidSnapshot: false } };
    expect(projectExportAccounting({ usage })).toEqual({ scope: 'session', status: 'partial', usageStatus: 'partial',
      recordedRequests: 1, tokens: { total: 130 }, requestCoverage: { status: 'unavailable' } });
  });

  it('keeps a captured absent price unavailable', () => {
    expect(projectExportAccounting({ usage: snapshot(null) })).not.toHaveProperty('estimatedCostUsd');
  });

  it('requires captured prices for every spent cache category', () => {
    const usage = snapshot({ ...rates, cacheWritePerMTok: undefined });
    expect(projectExportAccounting({ usage })).not.toHaveProperty('estimatedCostUsd');
  });

  it('does not use catalogue or assumed prices for legacy records', () => {
    const bucket = Object.values(snapshot().byModel)[0]!;
    const { attribution: _attribution, ...counts } = bucket;
    const usage = { ...snapshot(), byModel: { 'fixture/recorded': counts }, lastBucketKey: 'fixture/recorded' };
    const result = projectExportAccounting({ usage });
    expect(result.tokens?.total).toBe(130);
    expect(result).not.toHaveProperty('estimatedCostUsd');
  });

  it('preserves an explicitly recorded zero instead of treating it as missing', () => {
    const usage = snapshot({ promptPerMTok: 0, completionPerMTok: 0, cacheReadPerMTok: 0, cacheWritePerMTok: 0 });
    const bucket = Object.values(usage.byModel)[0]!;
    bucket.promptTokens = 0; bucket.completionTokens = 0; bucket.cacheReadTokens = 0; bucket.cacheWriteTokens = 0; bucket.totalTokens = 0;
    const result = projectExportAccounting({ usage });
    expect(result.usageStatus).toBe('recorded');
    expect(result.tokens).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 });
    expect(result.estimatedCostUsd).toBe(0);
  });

  it('retains dispatched unknown attempts and only the categories they recorded', () => {
    const ledger = dispatched(dispatched(trackedLedger()), { version: 1, inputTokens: 12, complete: false });
    const result = projectExportAccounting({ usage: snapshot(), requestLedger: ledger }, binding);
    expect(result.status).toBe('partial');
    expect(result.requestCoverage).toEqual({ status: 'partial', scopeCount: 1, pending: 2, dispatchedUnknown: 2,
      historyUnknown: false, breach: false, knownPartialTokens: { input: 12 } });
    expect(JSON.stringify(result)).not.toContain('PRIVATE_');
  });

  it('does not publish inconsistent partial usage as a known token quantity', () => {
    const ledger = dispatched(trackedLedger(), { version: 1, inputTokens: 12, complete: false, inconsistent: true });
    const result = projectExportAccounting({ requestLedger: ledger }, binding);
    expect(result.requestCoverage).toMatchObject({ status: 'partial', dispatchedUnknown: 1, breach: true });
    expect(result.requestCoverage).not.toHaveProperty('knownPartialTokens');
  });

  it('omits an unsafe partial sum while retaining unknown request counts', () => {
    let ledger = dispatched(trackedLedger(), { version: 1, inputTokens: Number.MAX_SAFE_INTEGER, complete: false });
    ledger = dispatched(ledger, { version: 1, inputTokens: 1, complete: false });
    const result = projectExportAccounting({ requestLedger: ledger }, binding);
    expect(result.requestCoverage).toMatchObject({ status: 'partial', pending: 2, dispatchedUnknown: 2 });
    expect(result.requestCoverage).not.toHaveProperty('knownPartialTokens');
  });

  it.each(['sessionId', 'sessionCreatedAt', 'directoryIdentity'] as const)('rejects a ledger with a different %s binding', field => {
    const requestLedger = { ...trackedLedger(), [field]: 'different' };
    expect(projectExportAccounting({ requestLedger }, binding).requestCoverage).toEqual({ status: 'unavailable' });
  });

  it('does not turn an empty or invalid ledger into clean coverage', () => {
    expect(projectExportAccounting({ requestLedger: createRequestLedger(binding) }, binding).requestCoverage.status).toBe('unavailable');
    expect(projectExportAccounting({ requestLedger: { ...trackedLedger(), schemaVersion: 2 } }, binding).requestCoverage.status).toBe('unavailable');
    expect(projectExportAccounting({ requestLedger: trackedLedger() }).requestCoverage.status).toBe('unavailable');
  });

  it('retains unknown history even after a later fully settled request', () => {
    const ledger = dispatched(initializeRequestScope(createRequestLedger(binding), scope, true),
      { version: 1, inputTokens: 10, outputTokens: 0, complete: true });
    expect(projectExportAccounting({ requestLedger: ledger }, binding).requestCoverage).toMatchObject({
      status: 'partial', pending: 0, dispatchedUnknown: 0, historyUnknown: true,
    });
  });
});
