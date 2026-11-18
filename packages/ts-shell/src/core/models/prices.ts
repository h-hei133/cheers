import { isRecord } from '../values/record.js';
import { captureCostSchedule, type ModelCostRates, type ModelCostTier, type ModelCostSchedule } from './pricing.js';

/** Prices from the public index use different category names from the runtime. */
function rates(value: Record<string, unknown>): ModelCostRates {
  const result: Record<string, number> = {};
  for (const [source, target] of [['input', 'promptPerMTok'], ['output', 'completionPerMTok'],
    ['cache_read', 'cacheReadPerMTok'], ['cache_write', 'cacheWritePerMTok']] as const) {
    const rate = value[source];
    if (rate === undefined) continue;
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0) throw new Error('Invalid published model prices.');
    result[target] = rate;
  }
  return result;
}

/** Only context-size price tiers apply to request input; service and time conditions stay separate. */
export function projectIndexPrices(value: unknown): ModelCostSchedule | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error('Invalid published model prices.');
  const base = rates(value);
  const tiers: ModelCostTier[] = [];
  if (value.tiers !== undefined) {
    if (!Array.isArray(value.tiers)) throw new Error('Invalid published model price tiers.');
    for (const item of value.tiers) {
      if (!isRecord(item) || !isRecord(item.tier)) throw new Error('Invalid published model price tiers.');
      if (item.tier.type !== 'context') continue;
      const inputTokensAbove = item.tier.size;
      if (typeof inputTokensAbove !== 'number' || !Number.isSafeInteger(inputTokensAbove) || inputTokensAbove < 0) {
        throw new Error('Invalid published model price threshold.');
      }
      tiers.push({ inputTokensAbove, ...rates(item) });
    }
  }
  // The legacy 200k field is used only when an authoritative tier array is absent.
  if (value.tiers === undefined && value.context_over_200k !== undefined) {
    if (!isRecord(value.context_over_200k)) throw new Error('Invalid published model prices.');
    tiers.push({ inputTokensAbove: 200_000, ...rates(value.context_over_200k) });
  }
  if (!Object.keys(base).length && !tiers.length) return undefined;
  return captureCostSchedule({ ...base, ...(tiers.length ? { tiers } : {}) }) ?? undefined;
}
