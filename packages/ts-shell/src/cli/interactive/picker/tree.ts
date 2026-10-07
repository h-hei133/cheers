import type { CommandContext } from "../../../core/commands/types.js";
import { readSessionNavigation, type SessionNavigationPoint } from "../../../session/query/navigation.js";
import type { Picker } from "../overlay.js";
import type { RewindPickerInput } from "./rewind.js";

export function treePicker(context: CommandContext, rewind: RewindPickerInput["rewind"]): Picker {
  let points: readonly SessionNavigationPoint[] = [];
  return {
    title: "Session tree",
    form: "modal",
    exclusive: true,
    empty: "No session entries are available.",
    async load() {
      points = context.sessionId ? readSessionNavigation(context.sessionId, context.cwd).points : [];
      return points.map((point) => ({
        id: point.entryId,
        label: `${"  ".repeat(point.depth)}${point.label}`,
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
