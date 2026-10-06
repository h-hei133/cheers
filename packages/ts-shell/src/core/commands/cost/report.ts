import type { ReportLine } from '../report/contract.js';
import { createReport, span } from '../report/projection.js';
import { cacheLines } from './cache.js';
import { money } from './format.js';
import type { CostModel } from './model.js';

export function costReport(model: CostModel) {
  const lines: ReportLine[] = [];
  if (model.recordedTurns === 0 && model.buckets.length === 0) {
    lines.push({ kind: 'text', spans: [span('No usage has been recorded in this session yet, so there is nothing to count.')] });
  } else {
    lines.push({ kind: 'text', bullet: true, spans: model.buckets.length === 1
      ? [span('Model '), span(model.buckets[0]!.key, 'code'), span(` · ${model.recordedTurns} recorded requests`)]
      : [span(model.buckets.length, 'number'), span(` models · ${model.recordedTurns} recorded requests`)] },
    { kind: 'text', bullet: true, spans: [span(model.recordedTokens.toLocaleString(), 'number'), span(' tokens reported by the provider')] });
    for (const bucket of model.buckets) lines.push(...bucketLines(bucket, model.buckets.length > 1));
    if (model.buckets.length > 1) lines.push({ kind: 'text', spans: [span('Session total estimate: '),
      span(money(model.estimate.usd), model.estimate.usd === null ? 'warning' : 'number')] });
    lines.push({ kind: 'space' }, { kind: 'text', spans: [span('Costs are estimates for recorded usage at the currently accepted rates, not a provider bill.')] });
    if (model.buckets.some(bucket => bucket.rateSource === 'assumed')) lines.push({ kind: 'text', spans: [span(
      'Some rates are estimates at a fixed fallback that does not follow the model in use.', 'warning')] });
    if (model.estimate.coverage === 'partial') lines.push({ kind: 'text', spans: [span(
      'Partial estimate: unpriced or unclassified tokens are excluded. Unknown costs are not zero.', 'warning')] });
    lines.push(...cacheLines(model.cache));
  }
  return createReport({ title: 'Usage', columns: [{ label: 'Category', minWidth: 12 }, { label: 'Tokens', minWidth: 8, align: 'right' },
    { label: 'Rate / million', minWidth: 14, align: 'right' }, { label: 'Estimated USD', minWidth: 14, align: 'right' }], lines,
    facts: { recordedTurns: model.recordedTurns, recordedTokens: model.recordedTokens, estimate: model.estimate, models: model.buckets,
      cache: { ...model.cache, usage: { ...model.cache.usage, hitRate: model.cache.usage.hitRate ?? null },
        waste: { totals: { ...model.cache.waste.totals }, misses: model.cache.waste.misses.map(miss => ({ ...miss })) } } },
  });
}

function bucketLines(bucket: CostModel['buckets'][number], heading: boolean): ReportLine[] {
  const lines: ReportLine[] = [{ kind: 'space' }];
  if (heading) lines.push({ kind: 'heading', spans: [span(bucket.key, 'heading'), span(` · ${bucket.turnsCount} recorded requests`)] });
  lines.push({ kind: 'text', spans: [span(`Rates: ${bucket.rateSource}${bucket.estimate.coverage === 'partial' ? ' · partial estimate' : ''}`,
    bucket.rateSource === 'assumed' || bucket.estimate.coverage === 'partial' ? 'warning' : 'muted')] },
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
