import { visibleWidth, sliceWithWidth } from "./measure.js";

export { visibleWidth, sliceWithWidth, stripAnsi, getCodePointWidth } from "./measure.js";

export function truncateToWidth(text: string, maxWidth: number): string {
  const width = visibleWidth(text);
  if (width <= maxWidth) return text;
  const sliced = sliceWithWidth(text, 0, Math.max(0, maxWidth - 1));
  return sliced.text + "…";
}

export type EllipsisMode = "start" | "middle" | "end";

export function truncateToWidthWithMode(text: string, maxWidth: number, mode: EllipsisMode = "end"): string {
  const width = visibleWidth(text);
  if (width <= maxWidth) return text;
  if (mode === "start") {
    const available = maxWidth - 1;
    const sliced = sliceWithWidth(text, width - available, available);
    return "…" + sliced.text;
  }
  if (mode === "middle") {
    const half = Math.floor((maxWidth - 1) / 2);
    const left = sliceWithWidth(text, 0, half);
    const right = sliceWithWidth(text, width - half, half);
    return `${left.text}…${right.text}`;
  }
  return truncateToWidth(text, maxWidth);
}

export function coalesceAdjacentSgr(text: string): string {
  return text.replace(/\x1b\[([0-9;]*)m(?=\x1b\[([0-9;]*)m)/g, (_match, _p1: string, offset: number, full: string) => {
    const rest = full.slice(offset);
    const match = rest.match(/^(\x1b\[[0-9;]*m)+/);
    if (!match) return _match;
    const tokens = match[0].split(/\x1b\[|m/).filter((t) => t.length > 0);
    if (tokens.length > 16) return _match;
    return `\x1b[${tokens.join(";")}m`;
  });
}