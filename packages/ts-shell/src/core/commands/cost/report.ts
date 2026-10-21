import type { ReportLine } from '../report/contract.js';
import { createReport, span } from '../report/projection.js';
import { cacheLines } from './cache.js';
import { money } from './format.js';
import type { CostModel } from './model.js';
import { createHash } from 'node:crypto';
import { reportMetadata } from '../report/metadata.js';

export function costReport(model: CostModel, projectRoot = process.cwd()) {
  const buckets = model.buckets.map(bucket => projectBucket(bucket, projectRoot));
  const lines: ReportLine[] = [];
  if (model.recordedTurns === 0 && model.buckets.length === 0) {
    lines.push({ kind: 'text', spans: [span('No usage has been recorded in this session yet, so there is nothing to count.')] });
  } else {
    lines.push({ kind: 'text', bullet: true, spans: model.buckets.length === 1
      ? [span('Model '), span(buckets[0]!.label, 'code'), span(` · ${model.recordedTurns} recorded request${model.recordedTurns === 1 ? '' : 's'}`)]
      : [span(model.modelCount, 'number'), span(` model${model.modelCount === 1 ? '' : 's'}${model.buckets.length !== model.modelCount ? ` · ${model.buckets.length} usage groups` : ''} · ${model.recordedTurns} recorded request${model.recordedTurns === 1 ? '' : 's'}`)] },
    { kind: 'text', bullet: true, spans: [span(model.recordedTokens.toLocaleString(), 'number'), span(' tokens reported by the provider')] });
    for (const bucket of buckets) lines.push(...bucketLines(bucket, model.buckets.length > 1));
    if (model.buckets.length > 1) lines.push({ kind: 'text', spans: [span('Session total estimate: '),
      span(money(model.estimate.usd), model.estimate.usd === null ? 'warning' : 'number')] });
    lines.push({ kind: 'space' }, { kind: 'text', spans: [span('Costs are estimates for recorded usage, not a provider bill.')] });
    if (model.buckets.some(bucket => bucket.rateBasis === 'captured')) lines.push({ kind: 'text', spans: [span('Captured rates belong to the destination at request time; later catalog changes do not reprice that usage.')] });
    if (model.buckets.some(bucket => bucket.rateBasis === 'current')) lines.push({ kind: 'text', spans: [span('Legacy usage has no captured destination or prices and uses the currently accepted model rates.')] });
    if (model.buckets.some(bucket => bucket.rateSource === 'assumed')) lines.push({ kind: 'text', spans: [span(
      'Some rates are estimates at a fixed fallback that does not follow the model in use.', 'warning')] });
    if (model.estimate.coverage === 'partial') lines.push({ kind: 'text', spans: [span(
      'Partial estimate: unpriced or unclassified tokens are excluded. Unknown costs are not zero.', 'warning')] });
    lines.push(...cacheLines(model.cache));
  }
  return createReport({ title: 'Usage', columns: [{ label: 'Category', minWidth: 12 }, { label: 'Tokens', minWidth: 8, align: 'right' },
    { label: 'Rate / million', minWidth: 14, align: 'right' }, { label: 'Estimated USD', minWidth: 14, align: 'right' }], lines,
    facts: { recordedTurns: model.recordedTurns, recordedTokens: model.recordedTokens, estimate: model.estimate,
      models: buckets.map(bucket => ({ ...bucket, attribution: bucket.attribution ? {
        ...bucket.attribution, rates: bucket.attribution.rates ? { ...bucket.attribution.rates } : null,
      } : null })),
      cache: { ...model.cache, usage: { ...model.cache.usage, hitRate: model.cache.usage.hitRate ?? null },
        waste: { totals: { ...model.cache.waste.totals }, misses: model.cache.waste.misses.map(miss => ({ ...miss })) } } },
  });
}

/** Group and price by raw identity first; safe report keys are never ledger keys. */
function projectBucket(bucket: CostModel['buckets'][number], projectRoot: string): CostModel['buckets'][number] {
  const safe = (value: string) => reportMetadata(value, projectRoot);
  const provider = safe(bucket.provider), model = safe(bucket.model);
  const rawName = bucket.provider ? `${bucket.provider}/${bucket.model}` : bucket.model;
  const name = provider ? `${provider}/${model}` : model;
  const suffix = safe(bucket.label.slice(rawName.length));
  // Legacy escaped keys contain JSON-encoded model text. Once either identity
  // changes for display, use an opaque stable key rather than copying that text.
  const key = provider === bucket.provider && model === bucket.model ? safe(bucket.key)
    : `redacted:${createHash('sha256').update(bucket.key).digest('hex')}`;
  return { ...bucket, key, provider, model, label: suffix ? `${name} ${suffix}` : name,
    ...(bucket.attribution ? { attribution: { ...bucket.attribution,
      provider: safe(bucket.attribution.provider), model: safe(bucket.attribution.model),
      ...(bucket.attribution.origin ? { origin: safe(bucket.attribution.origin) } : {}),
    } } : {}),
  };
}

function bucketLines(bucket: CostModel['buckets'][number], heading: boolean): ReportLine[] {
  const lines: ReportLine[] = [{ kind: 'space' }];
  if (heading) lines.push({ kind: 'heading', spans: [span(bucket.label, 'heading'), span(` · ${bucket.turnsCount} recorded request${bucket.turnsCount === 1 ? '' : 's'}`)] });
  lines.push({ kind: 'text', spans: [span(`Rates: ${bucket.rateSource} · ${bucket.rateBasis === 'captured' ? 'captured at request time' : 'legacy, current catalog'}${bucket.estimate.coverage === 'partial' ? ' · partial estimate' : ''}`,
    bucket.rateSource !== 'published' || bucket.estimate.coverage === 'partial' ? 'warning' : 'muted')] },
    category('In', bucket.promptTokens, bucket.rates.promptPerMTok), category('Out', bucket.completionTokens, bucket.rates.completionPerMTok));
  if (bucket.cacheReadTokens > 0 || bucket.cacheWriteTokens > 0) lines.push(
    category('Cache read', bucket.cacheReadTokens, bucket.rates.cacheReadPerMTok),
    category('Cache write', bucket.cacheWriteTokens, bucket.rates.cacheWritePerMTok));
  lines.push({ kind: 'columns', cells: [[span('Total')], [span(bucket.totalTokens.toLocaleString(), 'number')], [span('')],
    [span(money(bucket.estimate.usd), bucket.estimate.usd === null ? 'warning' : 'number')]] });
  if (!bucket.estimate.fullyAllocated) lines.push({ kind: 'text', spans: [span('Reported total differs from the recorded token categories.', 'warning')] });
  return lines;
}

function category(label: string, tokens: number, rate: number | null): ReportLine {
  return { kind: 'columns', cells: [[span(label)], [span(tokens.toLocaleString(), 'number')],
    [span(rate === null ? 'unknown' : `$${rate}`, rate === null ? 'warning' : 'number')],
    [span(tokens === 0 ? '—' : rate === null ? 'unknown' : money(tokens / 1_000_000 * rate), rate === null ? 'warning' : 'number')]] };
}
