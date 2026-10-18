import { afterEach, expect, it } from 'vitest';
import { costModel } from '../../core/commands/cost/model.js';
import { costReport } from '../../core/commands/cost/report.js';
import { reportText } from '../../core/commands/report/projection.js';
import { findCacheWaste, summarizeCacheUsage } from '../cacheWaste.js';
import { getSessionUsage, persistSessionUsage, recordSessionUsage, resetSessionUsage, restoreSessionUsage, totalTokens } from '../usageTelemetry.js';
import { attributedBucketKey, cacheIdentity, captureUsageAttribution, legacyBucketKey, splitBucketKey, usageBucketKey } from './identity.js';
import { decodeUsageSnapshot, mergeUsageDelta } from './snapshot.js';
import type { SessionUsageSnapshot } from './model.js';

const A = 'attributed-a', B = 'attributed-b';
const rates = { promptPerMTok: 1, completionPerMTok: 2, cacheReadPerMTok: 0.1 };
const capture = (baseUrl = 'https://relay.invalid/v1', prices = rates) => captureUsageAttribution({ provider: 'p', model: 'org/model', baseUrl, rates: prices });
const record = (session = A, attribution = capture(), tokens = 1_000_000) => recordSessionUsage(session, { attribution, promptTokens: tokens });
afterEach(() => { resetSessionUsage(A); resetSessionUsage(B); });

it('keeps actual destinations and request-time prices separate through catalog edits and resume', () => {
  record();
  record(A, capture('https://relay.invalid/v2', { ...rates, promptPerMTok: 3 }));
  record(A, capture('https://relay.invalid/v1', { ...rates, promptPerMTok: 5 }));
  let disk: SessionUsageSnapshot | undefined;
  persistSessionUsage(A, undefined, next => { disk = next; });
  restoreSessionUsage(B, JSON.parse(JSON.stringify(disk)));
  const report = costModel(getSessionUsage(B), [{ id: 'p', models: [{ id: 'org/model', cost: { ...rates, promptPerMTok: 99 } }] }] as never);
  expect(report.modelCount).toBe(1);
  expect(report.buckets).toHaveLength(3);
  expect(report.estimate).toMatchObject({ usd: 9, everyRatePublished: true, coverage: 'complete' });
  expect(report.buckets.every(bucket => bucket.rateBasis === 'captured')).toBe(true);
  expect(getSessionUsage(B).lastPromptTokens).toBeUndefined();
  const text = reportText(costReport(report));
  expect(text).toContain('3 usage groups');
  expect(text).toContain('https://relay.invalid');
  expect(text).not.toContain('@usage:');
  expect(text).not.toContain('/v1');
});

it('copies prices and strips secret-bearing URL components from every persisted field', () => {
  const prices = { ...rates };
  const attribution = capture('https://synthetic-user:synthetic-password@relay.invalid/private-path?key=synthetic-query#secret-fragment', prices);
  prices.promptPerMTok = 99;
  record(A, attribution);
  persistSessionUsage(A, undefined, snapshot => {
    const raw = JSON.stringify(snapshot);
    for (const secret of ['synthetic-user', 'synthetic-password', 'private-path', 'synthetic-query', 'secret-fragment']) expect(raw).not.toContain(secret);
  });
  const report = JSON.stringify(costReport(costModel(getSessionUsage(A), [])));
  for (const secret of ['synthetic-user', 'synthetic-password', 'private-path', 'synthetic-query', 'secret-fragment']) expect(report).not.toContain(secret);
  expect(costModel(getSessionUsage(A), []).estimate.usd).toBe(1);
  expect(Object.isFrozen(attribution.rates)).toBe(true);
});

it.each(['unknown', 'missing-cache', 'free'] as const)('preserves %s rates without replacing them at read time', kind => {
  const attribution = captureUsageAttribution({ provider: 'p', model: 'org/model', baseUrl: 'https://relay.invalid',
    ...(kind === 'unknown' ? {} : { rates: kind === 'free' ? { promptPerMTok: 0, completionPerMTok: 0 } : rates }) });
  recordSessionUsage(A, { attribution, ...(kind === 'missing-cache' ? { cacheWriteTokens: 42 } : { promptTokens: 42 }) });
  const report = costModel(getSessionUsage(A), [{ id: 'p', models: [{ id: 'org/model', cost: rates }] }] as never);
  expect(report.estimate.usd).toBe(kind === 'free' ? 0 : null);
  expect(report.estimate.coverage).toBe(kind === 'free' ? 'complete' : 'partial');
  expect(report.buckets[0]?.rateSource).toBe(kind === 'unknown' ? 'unknown' : 'published');
});

it('reports the known subtotal alongside an unknown destination', () => {
  record();
  record(A, captureUsageAttribution({ provider: 'p', model: 'org/model', baseUrl: 'https://unknown.invalid' }));
  expect(costModel(getSessionUsage(A), []).estimate).toEqual({ usd: 1, coverage: 'partial', everyRatePublished: false });
});

it('retains legacy current-price lookup independently of attributed usage', () => {
  recordSessionUsage(A, { provider: 'p', model: 'org/model', promptTokens: 1_000_000 });
  record();
  const report = costModel(getSessionUsage(A), [{ id: 'p', models: [{ id: 'org/model', cost: { ...rates, promptPerMTok: 8 } }] }] as never);
  expect(report.estimate.usd).toBe(9);
  expect(report.buckets.find(bucket => bucket.key === 'p/org/model')?.rateBasis).toBe('current');
  expect(reportText(costReport(report))).toContain('Legacy usage has no captured destination');
});

it('migrates all reserved-looking legacy keys injectively once without merging them with attributed counters', () => {
  const target = attributedBucketKey(capture());
  const keys = [target, legacyBucketKey(target), '@usage:legacy:"hello"', '__proto__', 'constructor', 'p/a/b'];
  const bucket = { promptTokens: 3, completionTokens: 0, totalTokens: 3, cacheReadTokens: 0, cacheWriteTokens: 0, turnsCount: 1 };
  const original = { byModel: Object.fromEntries(keys.map(key => [key, bucket])), turnsCount: keys.length,
    toolCallsCount: 0, lastBucketKey: target, lastUpdated: 1 };
  const migrated = decodeUsageSnapshot(original)!;
  expect(migrated.schemaVersion).toBe(2);
  expect(migrated.lastBucketKey).toBe(legacyBucketKey(target));
  expect(Object.keys(migrated.byModel)).toEqual(keys.map(legacyBucketKey));
  expect(decodeUsageSnapshot(migrated)).toEqual(migrated);
  restoreSessionUsage(A, original);
  record();
  expect(Object.keys(getSessionUsage(A).byModel)).toHaveLength(keys.length + 1);
  expect(totalTokens(getSessionUsage(A))).toBe(1_000_000 + keys.length * 3);
  expect(splitBucketKey(usageBucketKey('', '@usage:legacy:"hello"')).model).toBe('@usage:legacy:"hello"');
});

it('merges independent v1 and v2 writers, and retries failed persistence without adding old counts', () => {
  const attribution = capture();
  record(A, attribution, 100);
  let disk: SessionUsageSnapshot | undefined;
  const write = (next: SessionUsageSnapshot | undefined) => { disk = next; };
  persistSessionUsage(A, undefined, write);
  restoreSessionUsage(B, disk);
  record(A, attribution, 10); record(B, attribution, 20);
  expect(() => persistSessionUsage(A, disk, () => { throw new Error('disk full'); })).toThrow('disk full');
  persistSessionUsage(B, disk, write); persistSessionUsage(A, disk, write);
  persistSessionUsage(A, disk, write); persistSessionUsage(B, disk, write);
  expect(disk?.byModel[attributedBucketKey(attribution)]?.totalTokens).toBe(130);
  expect(disk?.turnsCount).toBe(3);
  const legacy = { byModel: {}, lastBucketKey: '', lastUpdated: 0, turnsCount: 0, toolCallsCount: 0 };
  expect(mergeUsageDelta(disk, legacy, legacy)).toEqual(disk);
});

it.each(['missing', 'price', 'endpoint', 'origin', 'negative', 'unknown-version', 'unknown-key'])('rejects %s attribution corruption', kind => {
  record();
  let snapshot: any;
  persistSessionUsage(A, undefined, next => { snapshot = JSON.parse(JSON.stringify(next)); });
  const key = Object.keys(snapshot.byModel)[0]!;
  const bucket = snapshot.byModel[key];
  if (kind === 'missing') delete bucket.attribution;
  if (kind === 'price') bucket.attribution.rates.promptPerMTok = 42;
  if (kind === 'endpoint') bucket.attribution.endpointId = 'f'.repeat(64);
  if (kind === 'origin') bucket.attribution.origin = 'https://user:secret@relay.invalid';
  if (kind === 'negative') bucket.attribution.rates.promptPerMTok = -1;
  if (kind === 'unknown-version') snapshot.schemaVersion = 3;
  if (kind === 'unknown-key') { snapshot.byModel['@usage:other'] = { ...bucket }; delete snapshot.byModel['@usage:other'].attribution; }
  expect(() => decodeUsageSnapshot(snapshot)).toThrow();
});

it('uses current captured cache prices while separating price edits from destination changes', () => {
  record(A, capture(), 10_000);
  record(A, capture('https://relay.invalid/v1', { ...rates, promptPerMTok: 3 }), 10_000);
  record(A, capture('https://relay.invalid/v2', { ...rates, promptPerMTok: 5 }), 10_000);
  const result = findCacheWaste(getSessionUsage(A).recentRequests, () => { throw new Error('must not reprice'); });
  expect(result.misses).toMatchObject([
    { modelChanged: false, endpointChanged: false },
    { modelChanged: false, endpointChanged: true },
  ]);
  expect(result.misses[0]?.missedCost).toBeCloseTo(0.029);
  expect(result.misses[1]?.missedCost).toBeCloseTo(0.049);
});

it('does not infer cache continuity between a legacy request and an attributed one', () => {
  recordSessionUsage(A, { provider: 'p', model: 'org/model', promptTokens: 10_000 });
  record(A, capture(), 10_000);
  expect(findCacheWaste(getSessionUsage(A).recentRequests, () => rates).misses).toEqual([]);
});

it('keeps cache accounting across price edits without inferring support at another destination', () => {
  recordSessionUsage(A, { attribution: capture(), promptTokens: 100, cacheReadTokens: 100 });
  record(A, capture('https://relay.invalid/v1', { ...rates, promptPerMTok: 3 }), 200);
  record(A, capture('https://relay.invalid/v2'), 300);
  const history = getSessionUsage(A).recentRequests;
  expect(history.map(entry => entry.reportedCache)).toEqual([true, true, false]);
  expect(summarizeCacheUsage(history)).toEqual({ promptTokens: 400, cacheReadTokens: 100, hitRate: 25, requestCount: 2 });
});

it('does not inherit cache accounting from a legacy model named like an attributed cache identity', () => {
  const attribution = capture();
  recordSessionUsage(A, { model: cacheIdentity('', attribution), promptTokens: 100, cacheReadTokens: 100 });
  recordSessionUsage(A, { attribution, promptTokens: 300 });
  const history = getSessionUsage(A).recentRequests;
  expect(history.map(entry => entry.reportedCache)).toEqual([true, false]);
  expect(summarizeCacheUsage(history)).toEqual({ promptTokens: 200, cacheReadTokens: 100, hitRate: 50, requestCount: 1 });
});

it('keeps background attribution out of the foreground measurement and cache history', () => {
  record();
  const previous = getSessionUsage(A);
  const key = previous.lastBucketKey, history = [...previous.recentRequests];
  recordSessionUsage(A, { attribution: capture('https://other.invalid'), promptTokens: 10 }, { affectsContext: false });
  expect(getSessionUsage(A)).toMatchObject({ lastBucketKey: key, lastPromptTokens: 1_000_000, recentRequests: history });
  expect(totalTokens(getSessionUsage(A))).toBe(1_000_010);
});
