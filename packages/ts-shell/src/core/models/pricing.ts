import { snapshotData } from '../values/data.js';
import { isRecord } from '../values/record.js';

/** Missing prices remain unknown; an explicit zero is a published free category. */
export interface ModelCostRates {
  readonly promptPerMTok?: number;
  readonly completionPerMTok?: number;
  readonly cacheReadPerMTok?: number;
  readonly cacheWritePerMTok?: number;
}

/** Overrides apply to the whole request strictly above its total input threshold. */
export interface ModelCostTier extends ModelCostRates {
  readonly inputTokensAbove: number;
}

export interface ModelCostSchedule extends ModelCostRates {
  readonly tiers?: readonly ModelCostTier[];
}

export const MAX_COST_TIERS = 64;
const RATE_FIELDS = ['promptPerMTok', 'completionPerMTok', 'cacheReadPerMTok', 'cacheWritePerMTok'] as const;
const LIMITS = { bytes: 32_768, nodes: 1024, depth: 4 } as const;

function pricingData(value: unknown): Record<string, unknown> {
  try {
    const data = snapshotData(value, LIMITS);
    if (isRecord(data)) return data;
  } catch { /* Source values and serialization hooks never enter the error. */ }
  throw new Error('Invalid model pricing.');
}

function readRates(value: Record<string, unknown>): Readonly<ModelCostRates> {
  const rates: Record<string, number> = {};
  for (const field of RATE_FIELDS) {
    const rate = value[field];
    if (rate === undefined) continue;
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0) throw new Error('Invalid model pricing.');
    rates[field] = rate;
  }
  return Object.freeze(rates);
}

/** Canonical flat snapshots keep existing persisted price identities stable. */
export function captureModelRates(value: unknown): Readonly<ModelCostRates> | null {
  if (value === null) return null;
  const data = pricingData(value);
  if (data.tiers !== undefined) throw new Error('Persisted model prices must be flat.');
  return readRates(data);
}

/** Capture bounded inert data before dispatch, including every nested override. */
export function captureCostSchedule(value: unknown): Readonly<ModelCostSchedule> | null {
  if (value === null) return null;
  const data = pricingData(value);
  const rates = readRates(data);
  if (data.tiers === undefined) return rates;
  if (!Array.isArray(data.tiers) || data.tiers.length > MAX_COST_TIERS) throw new Error('Invalid model pricing tiers.');
  const thresholds = new Set<number>();
  const tiers: ModelCostTier[] = [];
  for (const value of data.tiers) {
    if (!isRecord(value) || typeof value.inputTokensAbove !== 'number'
      || !Number.isSafeInteger(value.inputTokensAbove) || value.inputTokensAbove < 0
      || thresholds.has(value.inputTokensAbove)) throw new Error('Invalid model pricing tiers.');
    thresholds.add(value.inputTokensAbove);
    tiers.push(Object.freeze({ inputTokensAbove: value.inputTokensAbove, ...readRates(value) }));
  }
  return tiers.length ? Object.freeze({ ...rates, tiers: Object.freeze(tiers) }) : rates;
}

/** A known request input selects one tier; earlier requests and output never enter the threshold. */
export function selectCostRates(schedule: Readonly<ModelCostSchedule> | null, input: {
  readonly inputTokens?: number; readonly inputComplete?: boolean;
}): Readonly<ModelCostRates> | null {
  if (!schedule) return null;
  const base = readRates(schedule as Record<string, unknown>);
  if (!schedule.tiers?.length) return base;
  const tokens = input.inputTokens;
  if (input.inputComplete !== true || tokens === undefined || !Number.isSafeInteger(tokens) || tokens < 0) return null;
  let selected: ModelCostTier | undefined;
  for (const tier of schedule.tiers) {
    if (tokens > tier.inputTokensAbove && (!selected || tier.inputTokensAbove > selected.inputTokensAbove)) selected = tier;
  }
  // A tier inherits only this captured base, never a lower tier or a later catalogue.
  return selected ? Object.freeze({ ...base, ...readRates(selected as unknown as Record<string, unknown>) }) : base;
}

/** Categories spent without a captured rate cannot be included in the known subtotal. */
export function unpricedTokenCount(usage: {
  readonly promptTokens: number; readonly completionTokens: number;
  readonly cacheReadTokens: number; readonly cacheWriteTokens: number;
}, rates: ModelCostRates | undefined): number {
  return (rates?.promptPerMTok === undefined ? usage.promptTokens : 0)
    + (rates?.completionPerMTok === undefined ? usage.completionTokens : 0)
    + (rates?.cacheReadPerMTok === undefined ? usage.cacheReadTokens : 0)
    + (rates?.cacheWritePerMTok === undefined ? usage.cacheWriteTokens : 0);
}
