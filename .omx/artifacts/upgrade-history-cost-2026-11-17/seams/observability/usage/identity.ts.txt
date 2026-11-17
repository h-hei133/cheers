import { createHash } from 'node:crypto';
import { isRecord } from '../../core/values/record.js';
import type { ModelCostRates } from '../../core/models/catalog.js';
import type { UsageAttribution } from './model.js';

const namespace = '@usage:';
const legacyPrefix = `${namespace}legacy:`;
const targetPrefix = `${namespace}target:`;

/** Reserve an injective namespace without interpreting arbitrary legacy model IDs. */
export function legacyBucketKey(raw: string): string {
  return raw.startsWith(namespace) ? `${legacyPrefix}${JSON.stringify(raw)}` : raw;
}

export function usageBucketKey(provider: string, model: string): string {
  return legacyBucketKey(provider ? `${provider}/${model}` : model);
}

export function splitBucketKey(key: string): { readonly provider: string; readonly model: string } {
  const raw = key.startsWith(legacyPrefix) ? JSON.parse(key.slice(legacyPrefix.length)) as string : key;
  const separator = raw.indexOf('/');
  return separator === -1 ? { provider: '', model: raw }
    : { provider: raw.slice(0, separator), model: raw.slice(separator + 1) };
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function ratesSnapshot(value: unknown): Readonly<ModelCostRates> | null {
  if (value === null) return null;
  if (!isRecord(value)) throw new Error('Invalid session usage rates');
  const result: Record<string, number> = {};
  for (const field of ['promptPerMTok', 'completionPerMTok', 'cacheReadPerMTok', 'cacheWritePerMTok'] as const) {
    const rate = value[field];
    if (rate === undefined && (field === 'cacheReadPerMTok' || field === 'cacheWritePerMTok')) continue;
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0) throw new Error('Invalid session usage rates');
    result[field] = rate;
  }
  return Object.freeze(result) as unknown as Readonly<ModelCostRates>;
}

/** Capture only accounting identity; a URL's credentials, path and query never persist. */
export function captureUsageAttribution(input: {
  readonly provider: string; readonly model: string; readonly baseUrl: string; readonly rates?: ModelCostRates;
}): UsageAttribution {
  let origin: string | undefined;
  try {
    const url = new URL(input.baseUrl);
    if (url.protocol === 'https:' || url.protocol === 'http:') origin = url.origin;
  } catch { /* Invalid targets retain an opaque identity, never their raw address. */ }
  return Object.freeze({ provider: input.provider, model: input.model,
    endpointId: digest(input.baseUrl.trim().replace(/\/+$/, '')),
    ...(origin ? { origin } : {}), rates: ratesSnapshot(input.rates ?? null) });
}

export function attributedBucketKey(attribution: UsageAttribution): string {
  return `${targetPrefix}${digest(JSON.stringify([attribution.provider, attribution.model,
    attribution.endpointId, attribution.origin ?? null, ratesSnapshot(attribution.rates)]))}`;
}

/** Validate both metadata and its key before counters enter the cumulative store. */
export function decodeAttribution(key: string, value: unknown): UsageAttribution | undefined {
  if (value === undefined) {
    if (key.startsWith(namespace)) {
      if (!key.startsWith(legacyPrefix)) throw new Error('Invalid persisted session usage key');
      const raw: unknown = JSON.parse(key.slice(legacyPrefix.length));
      if (typeof raw !== 'string' || legacyBucketKey(raw) !== key) throw new Error('Invalid persisted session usage key');
    }
    return undefined;
  }
  if (!isRecord(value) || typeof value.provider !== 'string' || typeof value.model !== 'string'
    || typeof value.endpointId !== 'string' || !/^[a-f0-9]{64}$/.test(value.endpointId)) {
    throw new Error('Invalid persisted session usage attribution');
  }
  if (value.origin !== undefined) {
    if (typeof value.origin !== 'string') throw new Error('Invalid persisted session usage origin');
    const url = new URL(value.origin);
    if (!['https:', 'http:'].includes(url.protocol) || url.origin !== value.origin) throw new Error('Invalid persisted session usage origin');
  }
  const attribution = Object.freeze({ provider: value.provider, model: value.model, endpointId: value.endpointId,
    ...(typeof value.origin === 'string' ? { origin: value.origin } : {}), rates: ratesSnapshot(value.rates) });
  if (attributedBucketKey(attribution) !== key) throw new Error('Invalid persisted session usage attribution key');
  return attribution;
}

export function bucketIdentity(key: string, bucket: { readonly attribution?: UsageAttribution }) {
  return bucket.attribution ?? splitBucketKey(key);
}

export function bucketRates(key: string, bucket: { readonly attribution?: UsageAttribution },
  rateFor: (provider: string, model: string) => ModelCostRates | undefined): ModelCostRates | undefined {
  if (bucket.attribution) return bucket.attribution.rates ?? undefined;
  const identity = splitBucketKey(key);
  return rateFor(identity.provider, identity.model);
}

/** A price update alone does not replace the provider's prompt cache. */
export function cacheIdentity(key: string, attribution?: UsageAttribution): string {
  return attribution ? JSON.stringify(['target', attribution.provider, attribution.model, attribution.endpointId])
    : JSON.stringify(['legacy', key]);
}
