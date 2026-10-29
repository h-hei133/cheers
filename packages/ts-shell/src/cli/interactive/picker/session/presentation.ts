import type { Option } from '../../../../presentation/tui/chrome/options.js';
import type { SessionCatalogContinuation } from '../../../../session/store/catalog/model.js';
import type { SessionProjection } from './projection.js';

export function sessionDefaultSelection(projection: SessionProjection | undefined, rows: readonly Option[]): string | undefined {
  const summaries = projection?.summaries;
  return rows.filter(row => !row.disabled && summaries?.has(row.id))
    .sort((left, right) => Date.parse(summaries!.get(right.id)!.updatedAt) - Date.parse(summaries!.get(left.id)!.updatedAt)
      || left.id.localeCompare(right.id))[0]?.id;
}

export function sessionEmpty(projection: SessionProjection | undefined, query: string | undefined, pending: boolean,
  complete: boolean, continuation: SessionCatalogContinuation | undefined, allProjects: boolean): string {
  if (query) return pending || !complete
    ? 'Search results are incomplete; no match is confirmed absent.'
    : projection?.total ? 'No more matching sessions after this page boundary. Reopen to refresh earlier results.'
    : allProjects ? 'No sessions in authorized projects match this search.' : 'No sessions in this project match this search.';
  if (continuation && projection?.incomplete === false) return 'No more sessions after this page boundary. Reopen to refresh earlier results.';
  return projection?.incomplete !== false ? 'No selectable sessions in the loaded results.'
    : allProjects ? 'No recoverable sessions in authorized projects.' : 'No recoverable sessions for this project.';
}

export function sessionStatus(projection: SessionProjection | undefined, visible: readonly Option[], query: string,
  currentId: string, pending: boolean, complete: boolean, allProjects: boolean): string | undefined {
  const noMatch = query.trim() && complete && !pending && projection?.incomplete === false
    && projection.total === 0 && visible.length === 0
    ? allProjects ? 'No sessions in authorized projects match this search.' : 'No sessions in this project match this search.' : undefined;
  return [projection?.currentUnavailable ?? (visible.some(option => option.id === currentId)
    ? undefined : 'Current session is hidden by the filter.'), noMatch, projection?.status].filter(Boolean).join(' ') || undefined;
}
