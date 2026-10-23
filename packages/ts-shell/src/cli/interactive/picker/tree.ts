import type { CommandContext } from "../../../core/commands/types.js";
import { readSessionNavigation, type SessionNavigationPoint } from "../../../session/query/navigation.js";
import type { Picker } from "../overlay.js";
import type { RewindPickerInput } from "./rewind.js";
import { quoteCompletion } from "../completion.js";
import type { Option } from "../../../presentation/tui/chrome/options.js";
import { TreeModel } from '../../../presentation/tui/chrome/tree.js';

export type TreePickerMode = "tree" | "fork" | "history";
const MAX_VISIBLE_DEPTH = 10;

/**
 * Tree connectors for a depth-first point list.
 *
 * A point's ancestors are the most recent points at each lower depth. An
 * ancestor keeps a vertical line only when a later sibling follows it; the
 * point itself gets a branch glyph that says whether it is the last child.
 */
export function treePrefixes(points: readonly SessionNavigationPoint[]): string[] {
  const siblings: boolean[] = new Array(points.length);
  const upcoming: number[] = [];
  for (let index = points.length - 1; index >= 0; index--) {
    const depth = points[index]!.depth;
    while (upcoming.length && upcoming.at(-1)! > depth) upcoming.pop();
    siblings[index] = upcoming.at(-1) === depth;
    if (siblings[index]) upcoming.pop();
    upcoming.push(depth);
  }
  const ancestors: boolean[] = [];
  return points.map((point, index) => {
    let prefix = point.depth > MAX_VISIBLE_DEPTH ? '… ' : '';
    for (let depth = Math.max(0, point.depth - MAX_VISIBLE_DEPTH); depth < point.depth; depth++) {
      prefix += ancestors[depth] ? '│  ' : '   ';
    }
    ancestors.length = point.depth;
    ancestors.push(siblings[index]!);
    return prefix + (siblings[index] ? '├─ ' : '└─ ');
  });
}

export function treePicker(
  context: CommandContext,
  rewind: RewindPickerInput["rewind"],
  mode: TreePickerMode = "tree",
): Picker {
  const userOnly = mode === "fork";
  let points: readonly SessionNavigationPoint[] = [];
  let version: string | undefined;
  let tree: TreeModel | undefined;
  let query = '';
  const admission = (): string | undefined => {
    try { return context.admission?.(); }
    catch { return 'Session navigation is unavailable. Reopen the session tree.'; }
  };
  return {
    title: mode === "fork" ? 'Fork before saved question'
      : mode === "history" ? 'Session history' : 'Session tree',
    form: mode === 'tree' ? 'panel' : 'modal',
    ...(mode === 'tree' ? {
      fullScreen: true,
      footer: '← collapse/parent · → expand/child · Enter navigate · Esc to close. Files are kept.',
      loadError: 'Session tree unavailable or beyond navigation limits. No entries were selected.',
      filterOptions(filter: string, options: readonly Option[]) {
        query = filter;
        return tree?.filter(filter, options) ?? options;
      },
      navigate(direction: 'left' | 'right', id: string, filter: string) {
        return tree?.navigate(direction, id, filter);
      },
      detail(id: string | undefined) {
        const point = points.find(point => point.entryId === id);
        if (!point) return [];
        return [point.label, `Entry: ${point.entryId}`, `Parent: ${point.parentId ?? 'root'}`,
          ...(point.timestamp ? [`Saved: ${point.timestamp}`] : []),
          `State: ${point.unavailable ?? (point.current ? 'current' : 'available')}`,
          'Navigating keeps files.', ...(point.excerpt ? [point.excerpt] : [])];
      },
    } : {}),
    exclusive: true,
    empty: mode === "history" ? "No session history entries to show." : "No session entries are available.",
    ...(mode === "history" ? {
      footer: "Enter to draft /tree; Esc to close. Branches and files are kept.",
      loadError: "Session history unavailable. Reopen /history to retry.",
      status(visible: readonly Option[], query?: string) {
        const state = points.length === 0 ? "No saved session history is available."
          : visible.length === 0 && query?.trim() ? "No session history entries match this search."
          : `${visible.length} of ${points.length} entries.`;
        return `${state} Enter to draft /tree; Esc to close. Branches and files are kept.`;
      },
    } : {}),
    get initialSelection() {
      return points.find(point => point.current && point.unavailable === undefined)?.entryId;
    },
    async load(signal) {
      signal?.throwIfAborted();
      const blocked = admission();
      if (blocked) throw new Error(blocked);
      const snapshot = context.sessionId ? readSessionNavigation(context.sessionId, context.cwd) : undefined;
      signal?.throwIfAborted();
      version = snapshot?.version;
      points = snapshot?.points.filter(point => !userOnly || point.prompt !== undefined) ?? [];
      const prefixes = treePrefixes(points);
      const options = points.map((point, index) => ({
        id: point.entryId,
        depth: point.depth,
        label: `${prefixes[index]}${point.label}`,
        detail: point.entryId,
        searchText: `${point.entryId} ${point.label} ${point.searchText ?? point.prompt ?? ""}`,
        note: point.unavailable ?? (point.current ? "current" : "keeps files"),
        disabled: point.unavailable !== undefined,
      }));
      tree = mode === 'tree' ? new TreeModel(options) : undefined;
      return tree?.catalogue ?? options;
    },
    async apply(ids) {
      if (ids.length !== 1) return undefined;
      const point = points.find((candidate) => candidate.entryId === ids[0]);
      if (!point || point.unavailable) return undefined;
      if (tree && !tree.filter(query, tree.catalogue).some(option => option.id === point.entryId)) return undefined;
      const offeredVersion = version;
      points = []; tree = undefined; version = undefined; query = '';
      const blocked = admission();
      if (blocked) return { note: blocked };
      try {
        if (!context.sessionId || !offeredVersion
          || readSessionNavigation(context.sessionId, context.cwd).version !== offeredVersion) {
          return { note: 'The saved conversation changed after this tree opened. Reopen it before selecting an entry.' };
        }
      } catch {
        return { note: 'The saved conversation is unavailable. Reopen the session tree.' };
      }
      if (mode === "history") return { draft: `/tree -- ${quoteCompletion(point.entryId, "")}` };
      return await rewind({ entryId: point.entryId, prompt: point.prompt ?? "", dropped: 0, version: offeredVersion });
    },
    previewEnd() { points = []; tree = undefined; version = undefined; query = ''; },
  };
}
