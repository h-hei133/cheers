import type { CommandContext } from "../../../core/commands/types.js";
import { readSessionNavigation, type SessionNavigationPoint } from "../../../session/query/navigation.js";
import type { Picker } from "../overlay.js";
import type { RewindPickerInput } from "./rewind.js";

/**
 * Tree connectors for a depth-first point list.
 *
 * A point's ancestors are the most recent points at each lower depth. An
 * ancestor keeps a vertical line only when a later sibling follows it; the
 * point itself gets a branch glyph that says whether it is the last child.
 */
export function treePrefix(points: readonly SessionNavigationPoint[], index: number): string {
  const point = points[index];
  if (!point) return '';
  let prefix = '';
  for (let depth = 0; depth < point.depth; depth++) {
    const ancestor = ancestorAt(points, index, depth);
    prefix += ancestor !== undefined && hasSiblingAfter(points, ancestor) ? '│  ' : '   ';
  }
  return prefix + (hasSiblingAfter(points, index) ? '├─ ' : '└─ ');
}

function ancestorAt(points: readonly SessionNavigationPoint[], index: number, depth: number): number | undefined {
  for (let cursor = index - 1; cursor >= 0; cursor--) {
    const candidate = points[cursor]!;
    if (candidate.depth === depth) return cursor;
    if (candidate.depth < depth) return undefined;
  }
  return undefined;
}

/** Whether another point at the same depth follows before the branch closes. */
function hasSiblingAfter(points: readonly SessionNavigationPoint[], index: number): boolean {
  const depth = points[index]!.depth;
  for (let cursor = index + 1; cursor < points.length; cursor++) {
    const candidate = points[cursor]!;
    if (candidate.depth === depth) return true;
    if (candidate.depth < depth) return false;
  }
  return false;
}

export function treePicker(context: CommandContext, rewind: RewindPickerInput["rewind"], userOnly = false): Picker {
  let points: readonly SessionNavigationPoint[] = [];
  return {
    title: userOnly ? 'Fork before saved question' : 'Session tree',
    form: "modal",
    exclusive: true,
    empty: "No session entries are available.",
    get initialSelection() {
      return points.find(point => point.current && point.unavailable === undefined)?.entryId;
    },
    async load() {
      points = context.sessionId ? readSessionNavigation(context.sessionId, context.cwd).points.filter(point => !userOnly || point.prompt !== undefined) : [];
      return points.map((point, index) => ({
        id: point.entryId,
        label: `${treePrefix(points, index)}${point.label}`,
        detail: point.entryId,
        note: point.unavailable ?? (point.current ? "current" : "keeps files"),
        disabled: point.unavailable !== undefined,
      }));
    },
    async apply(ids) {
      const point = points.find((candidate) => candidate.entryId === ids[0]);
      if (!point || point.unavailable) return undefined;
      return rewind({ entryId: point.entryId, prompt: point.prompt ?? "", dropped: 0 });
    },
  };
}
