import { afterEach, expect, it } from 'vitest';
import { costModel } from '../../core/commands/cost/model.js';
import { costReport } from '../../core/commands/cost/report.js';
import { reportText } from '../../core/commands/report/projection.js';
import { usageFromProvider } from '../../provider/response/usage.js';
import { projectExportAccounting } from '../../session/export/accounting.js';
import { getSessionUsage, persistSessionUsage, recordSessionUsage, resetSessionUsage, restoreSessionUsage } from '../usageTelemetry.js';
import { attributedBucketKey, captureUsageAttribution } from './identity.js';
import { decodeUsageSnapshot, mergeUsageDelta } from './snapshot.js';
import { recoverUsageSnapshot } from './recovery.js';
import type { SessionUsageSnapshot } from './model.js';

const A = 'price-capture-a', B = 'price-capture-b';
const base = { promptPerMTok: 1, completionPerMTok: 2, cacheReadPerMTok: 0.1, cacheWritePerMTok: 1.25 };
afterEach(() => { resetSessionUsage(A); resetSessionUsage(B); });
const capture = (rates: Parameters<typeof captureUsageAttribution>[0]['rates']) => captureUsageAttribution({
  provider: 'fixture', model: 'meter', baseUrl: 'https://relay.invalid/v1', rates,
});

function persisted(): SessionUsageSnapshot {
  let disk: SessionUsageSnapshot | undefined;
  persistSessionUsage(A, undefined, next => { disk = next; });
  return JSON.parse(JSON.stringify(disk));
}

it('selects before cumulative buckets, retaining more requests than the bounded history', () => {
  const attribution = capture({ ...base, tiers: [{ inputTokensAbove: 100, promptPerMTok: 5 }] });
  for (let index = 0; index < 70; index++) recordSessionUsage(A, {
    ...usageFromProvider({ prompt_tokens: 60, completion_tokens: 0, prompt_tokens_details: { cached_tokens: 0 } }, 'inclusive'), attribution,
  });
  recordSessionUsage(A, { ...usageFromProvider({ prompt_tokens: 101, completion_tokens: 2, prompt_tokens_details: { cached_tokens: 0 } }, 'inclusive'), attribution });
  const telemetry = getSessionUsage(A);
  expect(telemetry.recentRequests).toHaveLength(64);
  const report = costModel(telemetry, []);
  expect(report.buckets).toHaveLength(2);
  expect(report.buckets.find(bucket => bucket.rates.promptPerMTok === 1)).toMatchObject({ promptTokens: 4200, turnsCount: 70 });
  expect(report.buckets.find(bucket => bucket.rates.promptPerMTok === 5)).toMatchObject({ promptTokens: 101, turnsCount: 1 });
  expect(report.estimate.usd).toBeCloseTo(0.004709, 10);
});

it('persists only selected flat prices and gives cost and export the same estimate after reopen', () => {
  const source = { ...base, tiers: [{ inputTokensAbove: 100, promptPerMTok: 5, completionPerMTok: 10,
    cacheReadPerMTok: 0.5, cacheWritePerMTok: 6.25 }] };
  const attribution = capture(source);
  for (const input of [100, 101]) recordSessionUsage(A, {
    ...usageFromProvider({ prompt_tokens: input, completion_tokens: 3, prompt_tokens_details: { cached_tokens: 50 } }, 'inclusive'), attribution,
  });
  const disk = persisted();
  expect(JSON.stringify(disk)).not.toContain('tiers');
  expect(JSON.stringify(disk)).not.toContain('costSchedule');
  source.promptPerMTok = 100; source.tiers[0]!.promptPerMTok = 500;
  restoreSessionUsage(B, disk);
  const report = costModel(getSessionUsage(B), [{ id: 'fixture', models: [{ id: 'meter', cost: source }] }] as never);
  const exported = projectExportAccounting({ usage: disk });
  expect(report.estimate).toMatchObject({ coverage: 'complete' });
  expect(report.estimate.usd).toBeCloseTo(0.000371, 10);
  expect(exported).toMatchObject({ usageStatus: 'recorded', recordedRequests: 2,
    tokens: { input: 201, output: 6, cacheRead: 100, cacheWrite: 0, total: 207 }, estimatedCostUsd: report.estimate.usd });
  expect(reportText(costReport(report))).toContain('2 usage groups');
});

it('keeps selected unknown input prices unknown after persistence and later catalog changes', () => {
  const attribution = capture({ ...base, tiers: [{ inputTokensAbove: 100, promptPerMTok: 5 }] });
  recordSessionUsage(A, { ...usageFromProvider({ prompt_tokens: 200, completion_tokens: 1 }, 'exclusive'), attribution });
  const disk = persisted();
  restoreSessionUsage(B, disk);
  const report = costModel(getSessionUsage(B), [{ id: 'fixture', models: [{ id: 'meter', cost: base }] }] as never);
  expect(report.buckets[0]).toMatchObject({ rateSource: 'unknown', rateBasis: 'captured', attribution: { rates: null } });
  expect(report.estimate).toMatchObject({ coverage: 'partial', usd: null });
  expect(projectExportAccounting({ usage: disk })).not.toHaveProperty('estimatedCostUsd');
});

it('withholds a price for zero-filled input even when a large output was reported', () => {
  const attribution = capture({ ...base, tiers: [{ inputTokensAbove: 100, promptPerMTok: 5 }] });
  recordSessionUsage(A, { ...usageFromProvider({ completion_tokens: 2000 }, 'inclusive'), attribution });
  expect(costModel(getSessionUsage(A), []).estimate).toMatchObject({ coverage: 'partial', usd: null });
});

it('prices known categories as a partial subtotal and distinguishes absent output from published zero', () => {
  const schedule = { promptPerMTok: 1, tiers: [{ inputTokensAbove: 0, promptPerMTok: 3 }] };
  recordSessionUsage(A, { ...usageFromProvider({ prompt_tokens: 10, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 0 } }, 'inclusive'), attribution: capture(schedule) });
  const partial = costModel(getSessionUsage(A), []);
  expect(partial.buckets[0]).toMatchObject({ rates: { completionPerMTok: null }, estimate: { unpricedTokens: 5, coverage: 'partial' } });
  expect(partial.estimate).toMatchObject({ coverage: 'partial', everyRatePublished: false });
  expect(partial.estimate.usd).toBeCloseTo(0.00003, 10);
  expect(projectExportAccounting({ usage: persisted() })).not.toHaveProperty('estimatedCostUsd');
  resetSessionUsage(A);
  recordSessionUsage(A, { ...usageFromProvider({ prompt_tokens: 10, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 0 } }, 'inclusive'), attribution: capture({
    ...schedule, tiers: [{ inputTokensAbove: 0, promptPerMTok: 3, completionPerMTok: 0 }],
  }) });
  expect(costModel(getSessionUsage(A), []).estimate).toMatchObject({ coverage: 'complete', everyRatePublished: true });
  expect(costModel(getSessionUsage(A), []).estimate.usd).toBeCloseTo(0.00003, 10);
  expect(projectExportAccounting({ usage: persisted() }).estimatedCostUsd).toBeCloseTo(0.00003, 10);
});

it.each(['cache', 'output'])('selects the rate from complete input but keeps missing %s accounting partial after reopen', missing => {
  const attribution = capture({ ...base, tiers: [{ inputTokensAbove: 100, promptPerMTok: 5 }] });
  recordSessionUsage(A, { ...usageFromProvider({ prompt_tokens: 101,
    ...(missing === 'cache' ? { completion_tokens: 1 } : { prompt_tokens_details: { cached_tokens: 0 } }),
  }, 'inclusive'), attribution });
  const disk = persisted();
  restoreSessionUsage(B, disk);
  const report = costModel(getSessionUsage(B), []);
  expect(report.buckets[0]?.rates.promptPerMTok).toBe(5);
  expect(report.estimate.coverage).toBe('partial');
  expect(disk.byModel[report.buckets[0]!.key]).toMatchObject({ allocationIncomplete: true });
  const exported = projectExportAccounting({ usage: disk });
  expect(exported.usageStatus).toBe('partial');
  expect(exported).not.toHaveProperty('estimatedCostUsd');
  if (missing === 'cache') {
    expect(report.buckets[0]?.promptTokens).toBe(0);
    expect(report.buckets[0]?.estimate.unpricedTokens).toBe(101);
    expect(report.estimate.usd).toBeCloseTo(0.000002, 10);
  }
});

it('does not erase an incomplete request allocation when a later request uses the same prices', () => {
  const attribution = capture({ ...base, tiers: [{ inputTokensAbove: 100, promptPerMTok: 5 }] });
  recordSessionUsage(A, { ...usageFromProvider({ prompt_tokens: 101 }, 'inclusive'), attribution });
  recordSessionUsage(A, { ...usageFromProvider({ prompt_tokens: 101, completion_tokens: 0,
    prompt_tokens_details: { cached_tokens: 0 } }, 'inclusive'), attribution });
  const disk = persisted();
  restoreSessionUsage(B, disk);
  expect(costModel(getSessionUsage(B), []).buckets).toHaveLength(1);
  expect(costModel(getSessionUsage(B), []).estimate.coverage).toBe('partial');
  expect(projectExportAccounting({ usage: disk })).not.toHaveProperty('estimatedCostUsd');
});

it('merges a zero-count allocation gap monotonically and retains it through tolerant recovery', () => {
  const attribution = capture({ ...base, tiers: [{ inputTokensAbove: 100, promptPerMTok: 5 }] });
  recordSessionUsage(A, { ...usageFromProvider({ prompt_tokens: 101 }, 'inclusive'), attribution });
  const current = persisted();
  const baseline = JSON.parse(JSON.stringify(current));
  const next = JSON.parse(JSON.stringify(current));
  const key = Object.keys(current.byModel)[0]!;
  delete baseline.byModel[key].allocationIncomplete; delete next.byModel[key].allocationIncomplete;
  const merged = mergeUsageDelta(current, next, baseline);
  expect(merged.byModel[key]?.allocationIncomplete).toBe(true);
  const damaged = { ...merged, byModel: { ...merged.byModel, '@usage:invalid': {} } };
  const recovered = recoverUsageSnapshot(damaged)!;
  expect(recovered.byModel[key]?.allocationIncomplete).toBe(true);
  expect(recovered.usageHealth?.rejectedBuckets).toBe(1);
  restoreSessionUsage(B, recovered);
  expect(costModel(getSessionUsage(B), []).estimate.coverage).toBe('partial');
});

it.each([false, 0, 'true', null])('rejects invalid persisted allocation marker %s', marker => {
  const attribution = capture(base), key = attributedBucketKey(attribution);
  expect(() => decodeUsageSnapshot({ schemaVersion: 2, byModel: { [key]: { attribution, allocationIncomplete: marker,
    promptTokens: 0, completionTokens: 0, totalTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, turnsCount: 1 } },
    turnsCount: 1, toolCallsCount: 0, lastBucketKey: key, lastUpdated: 1, recentRequests: [] })).toThrow('allocation');
});

it('excludes an explicitly invalid output category from the known tier subtotal', () => {
  const attribution = capture({ ...base, tiers: [{ inputTokensAbove: 100, promptPerMTok: 5, completionPerMTok: 10 }] });
  recordSessionUsage(A, { ...usageFromProvider({ prompt_tokens: 200, completion_tokens: 1.5, total_tokens: 201.5,
    prompt_tokens_details: { cached_tokens: 0 } }, 'inclusive'), attribution });
  const report = costModel(getSessionUsage(A), []);
  expect(report.buckets[0]).toMatchObject({ promptTokens: 200, completionTokens: 0, allocationIncomplete: true });
  expect(report.estimate.usd).toBeCloseTo(0.001, 10);
  expect(report.estimate.coverage).toBe('partial');
  const disk = persisted();
  expect(projectExportAccounting({ usage: disk })).toMatchObject({ usageStatus: 'partial' });
  expect(projectExportAccounting({ usage: disk })).not.toHaveProperty('estimatedCostUsd');
});

it('does not price aggregated legacy tokens at the base of a newly tiered catalog', () => {
  recordSessionUsage(A, { provider: 'fixture', model: 'meter', promptTokens: 300_000, completionTokens: 10 });
  const report = costModel(getSessionUsage(A), [{ id: 'fixture', models: [{ id: 'meter', cost: { ...base,
    tiers: [{ inputTokensAbove: 200_000, promptPerMTok: 5, completionPerMTok: 10 }] } }] }] as never);
  expect(report.buckets[0]?.rateSource).toBe('unknown');
  expect(report.buckets[0]?.rates.promptPerMTok).toBeNull();
  expect(report.estimate).toMatchObject({ usd: null, coverage: 'partial', everyRatePublished: false });
});
