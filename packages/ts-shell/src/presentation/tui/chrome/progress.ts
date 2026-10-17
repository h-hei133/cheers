import { defaultTheme } from "../../theme/theme.js";
import { truncateToWidth } from "../text/layout.js";
import { visibleWidth } from "../text/measure.js";

/**
 * A bounded progress line.
 *
 * Three states that must never be conflated: a real fraction when both the used
 * and total amounts are known, an indeterminate sweep when work is running but
 * the denominator is not, and an explicit unknown when nothing can be claimed.
 * The renderer never invents a percentage for the last two.
 */
export type ProgressProjection =
  | { readonly kind: "determinate"; readonly label: string; readonly used: number; readonly total: number }
  | { readonly kind: "indeterminate"; readonly label: string }
  | { readonly kind: "unknown"; readonly label: string };

const BAR = 10;

/** One row, at most `width` cells wide; the bar yields to the label when narrow. */
export function renderProgress(projection: ProgressProjection, width: number): string {
  if (width <= 0) return "";
  if (projection.kind !== "determinate") {
    const suffix = projection.kind === "indeterminate" ? "…" : "unknown";
    return truncateToWidth(`${projection.label} ${defaultTheme.dim(suffix)}`, width);
  }
  const total = projection.total;
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(projection.used)) {
    return renderProgress({ kind: "unknown", label: projection.label }, width);
  }
  const ratio = Math.min(1, Math.max(0, projection.used / total));
  const percent = Math.round(ratio * 100);
  const text = `${percent}%`;
  const room = width - visibleWidth(text) - 1;
  if (room < BAR + 2) return truncateToWidth(`${projection.label} ${text}`, width);
  const label = truncateToWidth(projection.label, Math.max(0, room - BAR - 2));
  const gap = Math.max(0, room - BAR - 2 - visibleWidth(label));
  const filled = Math.round(ratio * BAR);
  const bar = defaultTheme.fg("accent", "█".repeat(filled)) + defaultTheme.dim("░".repeat(BAR - filled));
  return `${label}${" ".repeat(gap)} ${bar} ${text}`;
}
