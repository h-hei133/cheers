import {
  sidebarPanelTextHasForbiddenContent,
  type SidebarPanel,
  type SidebarPanelLine,
  type SidebarPanelSection,
} from "./sidebarPanelModel.js";
import { truncateToWidth, widthPad, wrapToWidth } from "../tui/text/layout.js";

export interface RenderSidebarPanelOptions {
  readonly maxWidth?: number;
  readonly maxLines?: number;
}

export function renderSidebarPanel(
  panel: SidebarPanel,
  options: RenderSidebarPanelOptions = {},
): string {
  const width = clampInteger(
    options.maxWidth ?? panel.budget.maxWidth,
    40,
    panel.budget.maxWidth,
  );
  const maxLines = clampInteger(
    options.maxLines ?? panel.budget.maxLines,
    10,
    panel.budget.maxLines,
  );
  const innerWidth = width - 4;
  const output: string[] = [];

  output.push(border("top", width));
  output.push(boxLine(truncateToWidth(panel.title, innerWidth), width));
  output.push(border("middle", width));

  for (const section of panel.sections) {
    appendSection(output, section, width, innerWidth);
  }

  if (panel.warnings.length > 0) {
    appendSection(output, {
      id: "blockers",
      title: "Panel warnings",
      severity: "warning",
      lines: panel.warnings.map((warning) => ({
        text: warning.message,
        severity: warning.severity,
        sourceId: warning.id,
      })),
    }, width, innerWidth);
  }

  output.push(border("bottom", width));
  const budgeted = enforceLineBudget(output, width, maxLines);
  const text = budgeted.join("\n");
  if (sidebarPanelTextHasForbiddenContent(text)) {
    throw new Error("Sidebar panel render rejected forbidden content.");
  }
  return text;
}

function appendSection(
  output: string[],
  section: SidebarPanelSection,
  width: number,
  innerWidth: number,
): void {
  output.push(boxLine(`[${section.title}]`, width));
  const lines = section.lines.length > 0
    ? section.lines
    : [{ text: "No visible facts supplied.", severity: "info" as const }];
  for (const item of lines) {
    output.push(...renderPanelLine(item, width, innerWidth));
  }
}

function renderPanelLine(
  item: SidebarPanelLine,
  width: number,
  innerWidth: number,
): readonly string[] {
  const prefix = markerForSeverity(item.severity);
  const available = Math.max(8, innerWidth - prefix.length - 1);
  const chunks = wrapOrTruncate(item.text, available);
  return chunks.map((chunk, index) =>
    boxLine(`${index === 0 ? prefix : " ".repeat(prefix.length)} ${chunk}`, width),
  );
}

function wrapOrTruncate(value: string, maxWidth: number): readonly string[] {
  // Cell-accurate wrapping, so a fact carrying a CJK path or a combining mark
  // wraps on its real width instead of its code-unit count — the naive count
  // pushed wide content past the border and broke the box frame. Capped at
  // three rows; the third carries what is left, ellipsised, rather than
  // spilling the panel past its line budget.
  const compact = value.replace(/\s+/g, " ").trim();
  const wrapped = wrapToWidth(compact, maxWidth);
  if (wrapped.length <= 3) {
    return wrapped.length > 0 ? wrapped : [""];
  }
  return [wrapped[0]!, wrapped[1]!, truncateToWidth(wrapped.slice(2).join(" "), maxWidth)];
}

function enforceLineBudget(
  lines: readonly string[],
  width: number,
  maxLines: number,
): readonly string[] {
  if (lines.length <= maxLines) {
    return lines;
  }
  const bottom = lines.at(-1) ?? border("bottom", width);
  const hidden = lines.length - maxLines + 1;
  return [
    ...lines.slice(0, Math.max(0, maxLines - 2)),
    boxLine(`! ${hidden} lines hidden by panel budget.`, width),
    bottom,
  ];
}

function markerForSeverity(severity: SidebarPanelLine["severity"]): string {
  switch (severity) {
    case "success":
      return "+";
    case "warning":
      return "!";
    case "blocked":
      return "x";
    case "error":
      return "x";
    case "info":
      return "-";
  }
}

function boxLine(value: string, width: number): string {
  const contentWidth = width - 4;
  const safe = truncateToWidth(value, contentWidth);
  return `| ${safe}${widthPad(safe, contentWidth)} |`;
}

function border(kind: "top" | "middle" | "bottom", width: number): string {
  const left = kind === "top" ? "+" : kind === "bottom" ? "+" : "+";
  const right = left;
  return `${left}${"-".repeat(width - 2)}${right}`;
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.floor(value)));
}
