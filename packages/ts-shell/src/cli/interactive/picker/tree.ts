import type { CommandContext } from "../../../core/commands/types.js";
import { readSessionNavigationAsync, type SessionNavigationPoint } from "../../../session/query/navigation.js";
import type { Picker } from "../overlay.js";
import type { RewindPickerInput } from "./rewind.js";
import { quoteCompletion } from "../completion.js";
import type { Option } from "../../../presentation/tui/chrome/options.js";
import { TreeModel, type TreeOption } from '../../../presentation/tui/chrome/tree.js';
import { pickerSelection } from './selection/state.js';
import type { SessionSelectionContext } from '../../../session/navigation/selection.js';
import { normalizePathIdentity } from '../../../session/continuation/roots.js';

export type TreePickerMode = "tree" | "fork" | "history";
const MAX_VISIBLE_DEPTH = 10;
const CONTROL_CHECK_INTERVAL = 256;
const YIELD_INTERVAL = 1024;

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
  current?: () => SessionSelectionContext,
): Picker {
  const selection = pickerSelection(context, current, 'The session tree opening owner changed. Reopen it.');
  const userOnly = mode === "fork";
  let points: readonly SessionNavigationPoint[] = [];
  let version: string | undefined;
  let tree: TreeModel | undefined;
  let query = '';
  let closed = false;
  let accepting = false;
  let generation = 0;
  let browserSignal: AbortSignal | undefined;
  let action: typeof rewind | undefined = rewind;
  const unavailable = 'Session navigation was refused or is unavailable. Reopen the session tree.';
  const invalidate = (): void => { points = []; tree = undefined; version = undefined; query = ''; };
  const release = (accepted = false): void => {
    closed = true; generation++; invalidate(); browserSignal = undefined; action = undefined;
    if (!accepted) selection.release();
  };
  const check = (browsing = true, epoch = generation): void => {
    if (closed || epoch !== generation) throw new Error('Session tree picker is closed or its load was replaced.');
    if (browsing) browserSignal?.throwIfAborted();
    selection.check();
    if (closed || epoch !== generation) throw new Error('Session tree picker is closed or its load was replaced.');
    if (browsing) browserSignal?.throwIfAborted();
  };
  const read = async (signal?: AbortSignal) => {
    if (!selection.sessionId || !selection.root) return undefined;
    const snapshot = await readSessionNavigationAsync(selection.sessionId, selection.root, { signal });
    const root = normalizePathIdentity(selection.projectRoot!);
    if (!root || snapshot.session.id !== selection.sessionId || normalizePathIdentity(snapshot.session.projectRoot) !== root) {
      throw new Error('The saved session belongs to a different project or identity.');
    }
    return snapshot;
  };
  return {
    isCurrent: selection.isCurrent,
    title: mode === "fork" ? 'Fork before saved question'
      : mode === "history" ? 'Session history' : 'Session tree',
    form: mode === 'tree' ? 'panel' : 'modal',
    ...(mode === 'tree' ? {
      fullScreen: true,
      footer: '← collapse/parent · → expand/child · Enter navigate · Esc to close. Files are kept.',
      loadError: 'Session tree unavailable or beyond navigation limits. No entries were selected.',
      filterOptions(filter: string, options: readonly Option[]) {
        try { check(); query = filter; return tree?.filter(filter, options) ?? []; }
        catch { invalidate(); return []; }
      },
      navigate(direction: 'left' | 'right', id: string, filter: string) {
        try { check(); return tree?.navigate(direction, id, filter); }
        catch { invalidate(); return undefined; }
      },
      detail(id: string | undefined) {
        try {
          check();
          const point = points.find(point => point.entryId === id);
          if (!point) return [];
          return [point.label, `Entry: ${point.entryId}`, `Parent: ${point.parentId ?? 'root'}`,
            ...(point.timestamp ? [`Saved: ${point.timestamp}`] : []),
            `State: ${point.unavailable ?? (point.current ? 'current' : 'available')}`,
            'Navigating keeps files.', ...(point.excerpt ? [point.excerpt] : [])];
        } catch { invalidate(); return []; }
      },
    } : {}),
    exclusive: true,
    empty: mode === "history" ? "No session history entries to show." : "No session entries are available.",
    ...(mode === "history" ? {
      footer: "Enter to draft /tree; Esc to close. Branches and files are kept.",
      loadError: "Session history unavailable. Reopen /history to retry.",
      status(visible: readonly Option[], query?: string) {
        try { check(); } catch { invalidate(); return unavailable; }
        const state = points.length === 0 ? "No saved session history is available."
          : visible.length === 0 && query?.trim() ? "No session history entries match this search."
          : `${visible.length} of ${points.length} entries.`;
        return `${state} Enter to draft /tree; Esc to close. Branches and files are kept.`;
      },
    } : {}),
    get initialSelection() {
      try { check(); return points.find(point => point.current && point.unavailable === undefined)?.entryId; }
      catch { invalidate(); return undefined; }
    },
    async load(signal) {
      if (closed) throw new Error('Session tree picker is closed.');
      invalidate(); browserSignal = signal;
      const epoch = ++generation;
      try {
        check(true, epoch);
        const snapshot = await read(signal);
        check(true, epoch);
        const next: SessionNavigationPoint[] = [];
        for (let index = 0; index < (snapshot?.points.length ?? 0); index++) {
          if ((index & (CONTROL_CHECK_INTERVAL - 1)) === 0) signal?.throwIfAborted();
          if ((index & (YIELD_INTERVAL - 1)) === 0) await yieldForAbort(signal);
          const point = snapshot!.points[index]!;
          if (!userOnly || point.prompt !== undefined) next.push({ ...point });
        }
        const prefixes = treePrefixes(next);
        const options: TreeOption[] = [];
        for (let index = 0; index < next.length; index++) {
          if ((index & (CONTROL_CHECK_INTERVAL - 1)) === 0) signal?.throwIfAborted();
          if ((index & (YIELD_INTERVAL - 1)) === 0) await yieldForAbort(signal);
          const point = next[index]!;
          options.push({
            id: point.entryId,
            depth: point.depth,
            label: `${prefixes[index]}${point.label}`,
            detail: point.entryId,
            searchText: `${point.entryId} ${point.label} ${point.searchText ?? point.prompt ?? ""}`,
            note: point.unavailable ?? (point.current ? "current" : "keeps files"),
            disabled: point.unavailable !== undefined,
          });
        }
        const model = mode === 'tree' ? new TreeModel(options) : undefined;
        await yieldForAbort(signal);
        check(true, epoch);
        version = snapshot?.version; points = next; tree = model;
        return tree?.catalogue ?? options;
      } catch (error) { if (epoch === generation) invalidate(); throw error; }
    },
    async apply(ids) {
      if (closed || ids.length !== 1) return undefined;
      const point = points.find((candidate) => candidate.entryId === ids[0]);
      if (!point || point.unavailable) return undefined;
      if (tree && !tree.filter(query, tree.catalogue).some(option => option.id === point.entryId)) return undefined;
      const offeredVersion = version;
      try { check(!accepting); }
      catch { release(true); selection.release(true); return { note: unavailable }; }
      const navigate = action;
      const signal = accepting ? undefined : browserSignal;
      release(true);
      try {
        signal?.throwIfAborted();
        selection.check();
        const fresh = await read(signal);
        selection.check();
        signal?.throwIfAborted();
        if (!offeredVersion || fresh?.version !== offeredVersion) {
          selection.release(true);
          return { note: 'The saved conversation changed after this tree opened. Reopen it before selecting an entry.' };
        }
        selection.check();
      } catch { selection.release(true); return { note: unavailable }; }
      try {
        if (mode === "history") return { draft: `/tree -- ${quoteCompletion(point.entryId, "")}` };
        return await navigate?.({ entryId: point.entryId, prompt: point.prompt ?? "", dropped: 0, version: offeredVersion });
      } finally { selection.release(true); }
    },
    previewAccept() { try { check(); accepting = true; } catch { release(); } },
    previewEnd: () => release(),
  };
}

async function yieldForAbort(signal?: AbortSignal): Promise<void> {
  await new Promise<void>(resolve => setImmediate(resolve));
  signal?.throwIfAborted();
}
