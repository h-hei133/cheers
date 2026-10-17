import { defaultTheme } from "../../theme/theme.js";
import { padToWidth, truncateToWidth } from "../text/layout.js";
import { visibleWidth } from "../text/measure.js";

/** One chip in a tab strip: a stable id, a short label, and an optional count. */
export interface Chip {
  readonly id: string;
  readonly label: string;
  readonly count?: number;
}

/**
 * A single-row chip strip.
 *
 * The active chip stays visible: when the strip does not fit, the window slides
 * so the active chip is inside it rather than always anchoring at the first
 * chip. Overflow on either side is marked with an ellipsis so the row never
 * claims to show everything.
 */
export interface ChipStrip {
  readonly text: string;
  /** Visible chip spans in the rendered row, for pointer hit testing. */
  readonly spans: readonly { readonly id: string; readonly from: number; readonly to: number }[];
}

/** The chip row plus where each visible chip landed. */
export function chipStrip(chips: readonly Chip[], activeId: string | undefined, width: number): ChipStrip {
  if (width <= 0 || chips.length === 0) return { text: "", spans: [] };
  const rendered = chips.map(chip => {
    const text = chip.count === undefined ? chip.label : `${chip.label} ${chip.count}`;
    return chip.id === activeId ? defaultTheme.bold(`[${text}]`) : defaultTheme.dim(` ${text} `);
  });
  const active = Math.max(0, chips.findIndex(chip => chip.id === activeId));
  let start = 0;
  let end = chips.length;
  const total = () => rendered.slice(start, end).reduce((sum, text) => sum + visibleWidth(text), 0);
  while (total() > width && start < active) start += 1;
  while (total() > width && end > active + 1) end -= 1;
  const left = start > 0 ? "…" : "";
  const right = end < chips.length ? "…" : "";
  let line = left;
  const spans: { id: string; from: number; to: number }[] = [];
  for (let index = start; index < end; index++) {
    const from = visibleWidth(line);
    line += rendered[index]!;
    const to = visibleWidth(line);
    if (to > width - visibleWidth(right)) break;
    spans.push({ id: chips[index]!.id, from, to });
  }
  line = truncateToWidth(line, Math.max(0, width - visibleWidth(right)));
  return { text: padToWidth(line, Math.max(0, width - visibleWidth(right))) + right, spans };
}

export function renderChips(chips: readonly Chip[], activeId: string | undefined, width: number): string {
  if (width <= 0 || chips.length === 0) return "";
  const rendered = chips.map(chip => {
    const text = chip.count === undefined ? chip.label : `${chip.label} ${chip.count}`;
    return chip.id === activeId ? defaultTheme.bold(`[${text}]`) : defaultTheme.dim(` ${text} `);
  });
  const active = Math.max(0, chips.findIndex(chip => chip.id === activeId));
  let start = 0;
  let end = chips.length;
  const total = () => rendered.slice(start, end).reduce((sum, text) => sum + visibleWidth(text), 0);
  while (total() > width && start < active) start += 1;
  while (total() > width && end > active + 1) end -= 1;
  const left = start > 0 ? "…" : "";
  const right = end < chips.length ? "…" : "";
  let line = left + rendered.slice(start, end).join("");
  line = truncateToWidth(line, Math.max(0, width - visibleWidth(right)));
  return padToWidth(line, Math.max(0, width - visibleWidth(right))) + right;
}
