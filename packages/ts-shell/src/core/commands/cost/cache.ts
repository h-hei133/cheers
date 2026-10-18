import { CACHE_TTL_MS } from '../../../observability/cacheWaste.js';
import type { ReportLine } from '../report/contract.js';
import { span } from '../report/projection.js';
import type { CostModel } from './model.js';
import { money } from './format.js';

/** A bounded comparison of recorded prompts, not a measured billing adjustment. */
export function cacheLines(cache: CostModel['cache']): ReportLine[] {
  const { usage, waste } = cache;
  if (usage.requestCount === 0 && waste.totals.missCount === 0) return [];
  const lines: ReportLine[] = [{ kind: 'space' }, { kind: 'heading', spans: [span('Prompt cache', 'heading')] },
    { kind: 'text', bullet: true, spans: [span('Prompt cache hit rate: '),
      span(usage.hitRate === undefined ? 'unknown' : `${usage.hitRate.toFixed(1)}%`, usage.hitRate === undefined ? 'warning' : 'number')] }];
  if (waste.totals.missCount > 0) {
    lines.push({ kind: 'text', bullet: true, spans: [span(waste.totals.missedTokens.toLocaleString(), 'number'),
      span(' prompt tokens were sent again, across '), span(waste.totals.missCount, 'number'), span(' requests (estimated overlap)')] },
    { kind: 'text', bullet: true, spans: [span('Estimated extra cost against a cache read: '),
      span(money(waste.totals.missedCost), 'number'), span('; based on published rates, not an invoice')] });
    const switched = waste.misses.filter(miss => miss.modelChanged || miss.endpointChanged).length;
    if (switched > 0) lines.push({ kind: 'text', bullet: true, spans: [span(switched, 'number'),
      span(' followed a model or destination change; those could not have been cache reads at all')] });
    const idled = waste.misses.filter(miss => miss.idleMs > CACHE_TTL_MS).length;
    if (idled > 0) lines.push({ kind: 'text', bullet: true, spans: [span(idled, 'number'),
      span(` followed an idle gap longer than ${Math.round(CACHE_TTL_MS / 60000)} minutes, long enough for a cache to expire`)] });
  }
  lines.push({ kind: 'text', spans: [span('Counted over '), span(cache.retainedRequests, 'number'),
    span(' measured requests in the retained history ('), span(cache.retainedEntries, 'number'),
    span(' entries including context resets and usage gaps), not the whole session.')] });
  return lines;
}
