import { defaultTheme } from "../../theme/theme.js";
import { renderStatusItem, type StatusFacts, type StatusItemId } from "../chrome/items.js";
import { truncateToWidth } from "../text/layout.js";
import { visibleWidth } from "../text/measure.js";

const RIGHT_ITEMS = new Set<StatusItemId>(["context", "session-tokens", "cost", "turns", "queued", "peers"]);

/** Keep the first configured facts as width pressure removes later segments. */
function fit(parts: readonly string[], width: number): string {
  const visible = [...parts];
  const divider = defaultTheme.fg("border", " ▏ ");
  while (visible.length > 1 && visibleWidth(visible.join(divider)) > width) visible.pop();
  return truncateToWidth(visible.join(divider), width);
}

/** Shape-independent status groups; each shape owns where and how they appear. */
export function composerStatus(facts: StatusFacts, items: readonly StatusItemId[], width: number): {
  readonly left: string; readonly right: string; readonly full: string;
} {
  const parts = items.flatMap(id => {
    const text = renderStatusItem(id, facts);
    return text ? [{ id, text }] : [];
  });
  if (parts.length === 0) parts.push({ id: "model", text: defaultTheme.fg("statusLineModel", facts.model) });
  return {
    left: fit(parts.filter(part => !RIGHT_ITEMS.has(part.id)).map(part => part.text), width),
    right: fit(parts.filter(part => RIGHT_ITEMS.has(part.id)).map(part => part.text), Math.max(0, width - 2)),
    full: fit(parts.map(part => part.text), width),
  };
}
