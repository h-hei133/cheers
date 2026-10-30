import type { Option } from '../../../../presentation/tui/chrome/options.js';
import { matchRank } from '../../../../presentation/tui/text/search.js';

/** Rank fields within contiguous categories while retaining their declared order. */
export function searchSettings(query: string, options: readonly Option[], groups: ReadonlyMap<string, string>, categoryOrder: readonly string[]): readonly Option[] {
  const ranked = options.map((option, order) => ({ option, order, group: groups.get(option.id) ?? '',
    rank: Math.max(matchRank(query, option.id), matchRank(query, option.label, `${option.detail ?? ''} ${option.note ?? ''} ${option.searchText ?? ''}`)),
  })).filter(entry => entry.rank > 0);
  const best = new Map<string, number>();
  for (const entry of ranked) best.set(entry.group, Math.max(best.get(entry.group) ?? 0, entry.rank));
  return ranked.sort((a, b) => (best.get(b.group)! - best.get(a.group)!) ||
    categoryOrder.indexOf(a.group) - categoryOrder.indexOf(b.group) || b.rank - a.rank || a.order - b.order)
    .map(entry => entry.option);
}
