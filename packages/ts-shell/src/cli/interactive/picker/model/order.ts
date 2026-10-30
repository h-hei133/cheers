import type { CatalogProvider } from '../../../../core/models/catalog.js';
import type { Option } from '../../../../presentation/tui/chrome/options.js';
import type { NavigationGroup, NavigationItem } from '../navigation.js';

/** Order discovery rows without changing readiness, connection identity or admission. */
export function orderModelCatalog(catalog: readonly CatalogProvider[], rows: Option[],
  groups: ReadonlyMap<string, NavigationGroup>, ready: ReadonlySet<string | undefined>): readonly NavigationItem[] {
  const providers = [...catalog].sort((left, right) => Number(!ready.has(left.id)) - Number(!ready.has(right.id))
    || (left.label || left.id).localeCompare(right.label || right.id) || left.id.localeCompare(right.id));
  const positions = new Map(providers.map((provider, index) => [provider.id, index]));
  rows.sort((left, right) => Number(!ready.has(groups.get(left.id)?.category)) - Number(!ready.has(groups.get(right.id)?.category))
    || left.label.localeCompare(right.label)
    || (positions.get(groups.get(left.id)?.category ?? '') ?? 0) - (positions.get(groups.get(right.id)?.category ?? '') ?? 0));
  let heading = 'section:not-ready';
  while (positions.has(heading)) heading += ':';
  const items: NavigationItem[] = [];
  let separated = false;
  for (const provider of providers) {
    if (!ready.has(provider.id) && !separated) {
      items.push({ id: heading, label: 'Not ready', disabled: true }); separated = true;
    }
    items.push({ id: provider.id, label: provider.label || provider.id, note: ready.has(provider.id) ? undefined : '○' });
  }
  return items;
}
