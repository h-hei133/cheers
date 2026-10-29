import { afterEach, describe, expect, it, vi } from 'vitest';
import { findCacheWaste } from '../cacheWaste.js';
import { StructuredLogger } from '../structuredLogger.js';
import { estimateSessionCost, getSessionUsage, persistSessionUsage, recordSessionUsage, resetSessionUsage, restoreSessionUsage, totalTokens } from '../usageTelemetry.js';
import { attributedBucketKey, captureUsageAttribution, decodeAttribution } from './identity.js';
import type { SessionUsageSnapshot } from './model.js';
import { recoverUsageSnapshot } from './recovery.js';
import { decodeUsageSnapshot } from './snapshot.js';

const ID = 'usage-recovery';
const bucket = { promptTokens: 100, completionTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 120, turnsCount: 1 };
const snapshot = () => ({ schemaVersion: 2 as const, byModel: { 'fixture/model': { ...bucket } },
  turnsCount: 1, toolCallsCount: 0, lastBucketKey: 'fixture/model', lastUpdated: 1, recentRequests: [] });
afterEach(() => { resetSessionUsage(ID); vi.restoreAllMocks(); });

describe('persisted usage recovery', () => {
  it('keeps strict attribution admission while retaining healthy buckets around a malformed key', () => {
    const raw = { ...snapshot(), byModel: { '@usage:invalid-before': { ...bucket },
      'fixture/model': { ...bucket }, '@usage:invalid-after': { ...bucket } } };
    expect(() => decodeAttribution('@usage:invalid-before', undefined)).toThrow('Invalid persisted session usage key');
    expect(() => decodeUsageSnapshot(raw)).toThrow('Invalid persisted session usage key');
    const restored = recoverUsageSnapshot(raw)!;
    expect(Object.keys(restored.byModel)).toEqual(['fixture/model']);
    expect(restored.byModel['fixture/model']).toEqual(bucket);
    expect(restored.usageHealth).toEqual({ status: 'degraded', rejectedBuckets: 2, rejectedHistoryEntries: 0, invalidSnapshot: false });
    expect(Object.getPrototypeOf(restored.byModel)).toBeNull();
    expect(decodeUsageSnapshot(restored)).toEqual(restored);
  });

  it.each(['missing-attribution', 'changed-price', 'bad-count'] as const)('rejects %s locally while retaining other accounting', fault => {
    const attribution = captureUsageAttribution({ provider: 'relay', model: 'model', baseUrl: 'https://fixture.invalid/v1',
      rates: { promptPerMTok: 1, completionPerMTok: 2 } });
    const damaged = { ...bucket, attribution: fault === 'missing-attribution' ? undefined
      : fault === 'changed-price' ? { ...attribution, rates: { promptPerMTok: 99, completionPerMTok: 2 } } : attribution,
      ...(fault === 'bad-count' ? { totalTokens: -1 } : {}) };
    const restored = recoverUsageSnapshot({ ...snapshot(), byModel: { 'fixture/model': { ...bucket },
      [attributedBucketKey(attribution)]: damaged } })!;
    expect(Object.keys(restored.byModel)).toEqual(['fixture/model']);
    expect(restored.usageHealth?.rejectedBuckets).toBe(1);
  });

  it('restores without an escaping rejection and emits only safe accounting diagnostics', () => {
    const warn = vi.spyOn(StructuredLogger.prototype, 'warn').mockImplementation(() => undefined);
    const key = '@usage:invalid-synthetic-secret-bearing-key';
    expect(() => restoreSessionUsage(ID, { ...snapshot(), byModel: { 'fixture/model': { ...bucket }, [key]: { ...bucket } } })).not.toThrow();
    expect(totalTokens(getSessionUsage(ID))).toBe(120);
    expect(getSessionUsage(ID).usageHealth?.status).toBe('degraded');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('missing costs are unknown'), expect.objectContaining({ rejectedBuckets: 1 }));
    expect(JSON.stringify(warn.mock.calls)).not.toContain(key);
  });

  it.each([{ raw: null }, { raw: {} }, { raw: { ...snapshot(), schemaVersion: 3 } }])('keeps malformed snapshots visibly degraded: %j', ({ raw }) => {
    // A known schema is required before interpreting its accounting identity.
    expect(() => restoreSessionUsage(ID, raw)).not.toThrow();
    const usage = getSessionUsage(ID);
    expect(usage.usageHealth?.invalidSnapshot).toBe(true);
    const estimate = estimateSessionCost(usage, () => ({ promptPerMTok: 0, completionPerMTok: 0 }));
    expect(estimate).toMatchObject({ cost: 0, partial: true, zeroCostSupported: false, everyRatePublished: false });
  });

  it('does not claim a complete zero cost when surviving buckets have published free rates', () => {
    restoreSessionUsage(ID, { ...snapshot(), byModel: { 'fixture/model': { ...bucket }, '@usage:invalid': { ...bucket } } });
    expect(estimateSessionCost(getSessionUsage(ID), () => ({ promptPerMTok: 0, completionPerMTok: 0 })))
      .toMatchObject({ cost: 0, partial: true, zeroCostSupported: false });
  });

  it('rejects negative health metadata and retains healthy bucket counts as degraded', () => {
    const restored = recoverUsageSnapshot({ ...snapshot(), usageHealth: { status: 'degraded', rejectedBuckets: -1,
      rejectedHistoryEntries: 0, invalidSnapshot: false } })!;
    expect(restored.byModel['fixture/model']).toEqual(bucket);
    expect(restored.usageHealth).toMatchObject({ status: 'degraded', rejectedBuckets: 0, invalidSnapshot: true });
  });

  it('bounds overlong history while marking the discarded records as incomplete accounting', () => {
    const request = { promptTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0,
      bucketKey: 'fixture/model', timestamp: 1, reportedCache: false, kind: 'request' };
    const restored = recoverUsageSnapshot({ ...snapshot(), recentRequests: Array.from({ length: 65 }, () => ({ ...request })) })!;
    expect(restored.recentRequests).toHaveLength(64);
    expect(restored.usageHealth?.rejectedHistoryEntries).toBe(1);
  });

  it('retains healthy history around corruption without inferring cache continuity across the lost request', () => {
    const request = { promptTokens: 10_000, cacheReadTokens: 0, cacheWriteTokens: 0,
      bucketKey: 'fixture/model', timestamp: 1, reportedCache: true, kind: 'request' };
    const restored = recoverUsageSnapshot({ ...snapshot(), recentRequests: [request,
      { ...request, bucketKey: '@usage:invalid-history' }, { ...request, timestamp: 3 }] })!;
    expect(restored.recentRequests.map(entry => entry.kind)).toEqual(['request', 'usage-gap', 'request']);
    expect(restored.usageHealth?.rejectedHistoryEntries).toBe(1);
    expect(findCacheWaste(restored.recentRequests, () => ({ promptPerMTok: 1, completionPerMTok: 2, cacheReadPerMTok: 0.1 })).misses).toEqual([]);
    expect(decodeUsageSnapshot(restored)?.recentRequests).toHaveLength(3);
  });

  it('keeps degradation across successful persistence and later healthy requests', () => {
    restoreSessionUsage(ID, { ...snapshot(), byModel: { 'fixture/model': { ...bucket }, '@usage:invalid': { ...bucket } } });
    recordSessionUsage(ID, { provider: 'fixture', model: 'model', promptTokens: 10 });
    let disk: SessionUsageSnapshot | undefined;
    persistSessionUsage(ID, snapshot(), next => { disk = next; });
    expect(disk?.byModel['fixture/model']?.totalTokens).toBe(130);
    expect(disk?.usageHealth?.rejectedBuckets).toBe(1);
    resetSessionUsage(ID); restoreSessionUsage(ID, JSON.parse(JSON.stringify(disk)));
    expect(getSessionUsage(ID).usageHealth?.status).toBe('degraded');
    expect(estimateSessionCost(getSessionUsage(ID), () => ({ promptPerMTok: 1, completionPerMTok: 2 })).partial).toBe(true);
  });

  it.each(['invalid', 'missing'] as const)('preserves a verified baseline bucket if the persisted copy is %s before flushing a new delta', fault => {
    restoreSessionUsage(ID, snapshot());
    recordSessionUsage(ID, { provider: 'fixture', model: 'model', promptTokens: 10 });
    let disk: SessionUsageSnapshot | undefined;
    persistSessionUsage(ID, { ...snapshot(), byModel: fault === 'missing' ? {} : { 'fixture/model': { ...bucket, totalTokens: -1 } } }, next => { disk = next; });
    expect(disk?.byModel['fixture/model']?.totalTokens).toBe(130);
    expect(disk?.usageHealth?.rejectedBuckets).toBe(1);
    persistSessionUsage(ID, disk, next => { disk = next; });
    expect(disk?.byModel['fixture/model']?.totalTokens).toBe(130);
    expect(disk?.usageHealth?.rejectedBuckets).toBe(1);
  });

  it('retains pending increments and degraded state when the actual writer fails', () => {
    restoreSessionUsage(ID, snapshot());
    recordSessionUsage(ID, { provider: 'fixture', model: 'model', promptTokens: 10 });
    const damaged = { ...snapshot(), byModel: { 'fixture/model': { ...bucket, totalTokens: -1 } } };
    expect(() => persistSessionUsage(ID, damaged, () => { throw new Error('disk full'); })).toThrow('disk full');
    expect(totalTokens(getSessionUsage(ID))).toBe(130);
    expect(getSessionUsage(ID).usageHealth?.status).toBe('degraded');
    let disk: SessionUsageSnapshot | undefined;
    persistSessionUsage(ID, damaged, next => { disk = next; });
    expect(disk?.byModel['fixture/model']?.totalTokens).toBe(130);
  });

  it('refuses valid counters that moved backwards without guessing the missing increment', () => {
    restoreSessionUsage(ID, snapshot());
    recordSessionUsage(ID, { provider: 'fixture', model: 'model', promptTokens: 10 });
    const write = vi.fn();
    expect(() => persistSessionUsage(ID, { ...snapshot(), byModel: { 'fixture/model': { ...bucket, totalTokens: 119 } } }, write))
      .toThrow('Persisted session usage counters moved backwards');
    expect(write).not.toHaveBeenCalled();
    expect(totalTokens(getSessionUsage(ID))).toBe(130);
  });

  it('does not conceal a valid backwards request counter behind unrelated corruption', () => {
    restoreSessionUsage(ID, snapshot());
    recordSessionUsage(ID, { provider: 'fixture', model: 'model', promptTokens: 10 });
    const write = vi.fn();
    expect(() => persistSessionUsage(ID, { ...snapshot(), turnsCount: 0, lastBucketKey: '@usage:invalid' }, write))
      .toThrow('Persisted session usage counters moved backwards');
    expect(write).not.toHaveBeenCalled();
  });

  it('prevents writer aliasing from changing counters or acknowledgement after publication', () => {
    restoreSessionUsage(ID, snapshot());
    recordSessionUsage(ID, { provider: 'fixture', model: 'model', promptTokens: 10 });
    let disk: SessionUsageSnapshot | undefined;
    persistSessionUsage(ID, snapshot(), next => { disk = next; });
    expect(() => { disk!.byModel['fixture/model']!.totalTokens = 999; }).toThrow();
    expect(totalTokens(getSessionUsage(ID))).toBe(130);
    persistSessionUsage(ID, disk, next => { disk = next; });
    expect(disk?.byModel['fixture/model']?.totalTokens).toBe(130);
  });
});
