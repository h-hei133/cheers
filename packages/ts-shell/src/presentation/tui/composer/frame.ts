import { defaultTheme } from "../../theme/theme.js";
import { padToWidth, truncateToWidth } from "../text/layout.js";
import { visibleWidth } from "../text/measure.js";
import type { ComposerState } from "./contract.js";
import type { ComposerShape } from "./shapes.js";

export interface ComposerFrame {
  readonly width: number;
  readonly gutter: number;
  readonly left: number;
  readonly right: number;
  readonly paddingLeft: number;
  readonly paddingRight: number;
  readonly text: number;
}

/** Body rows the composer may show, independent of decoration. */
export const MAX_COMPOSER_CONTENT_ROWS = 16;

export interface ComposerChrome {
  readonly top: boolean;
  readonly bottom: boolean;
  readonly footer: string;
  readonly gap: boolean;
  readonly contentRows: number | undefined;
}

/** Drop decoration first; an ordinary prompt's cue already separates its text. */
export function composerFrame(width: number, shape: ComposerShape, scrolling: boolean): ComposerFrame {
  const bounded = Math.max(0, Math.floor(width));
  let left = shape.side === "none" ? 0 : 1;
  let right = shape.side === "caps" || shape.side === "round" || (shape.side === "rail" && scrolling) ? 1 : 0;
  if (bounded < left + right + 5) left = right = 0;
  const gutter = Math.min(visibleWidth(shape.gutter), Math.max(0, bounded - left - right - 5));
  const padding = Math.min(1, Math.max(0, Math.floor((bounded - left - right - gutter - 1) / 2)));
  const paddingLeft = shape.id === 'default' || shape.id === 'borderless' || shape.id === 'top-rule' ? 0 : padding;
  return { width: bounded, left, right, gutter, paddingLeft, paddingRight: padding,
    text: bounded - left - right - gutter - paddingLeft - padding };
}

/** The total budget always leaves an editable row before optional chrome. */
export function composerChrome(shape: ComposerShape, state: ComposerState, width: number, maxRows: number | undefined, tail: boolean): ComposerChrome {
  const limit = maxRows === undefined ? Infinity : Math.max(0, Math.floor(maxRows));
  let top = width >= 3 && shape.top !== "none";
  let bottom = width >= 3 && (shape.bottom === "rule" || (shape.bottom === "merge" && tail));
  let footer = width >= 3 ? (shape.bottomBar === "left" ? state.status?.left : shape.bottomBar === "full" ? state.status?.full : "") ?? "" : "";
  let gap = shape.gap && footer.length > 0;
  const count = () => Number(top) + Number(bottom) + Number(gap) + Number(footer.length > 0);
  if (count() >= limit) gap = false;
  if (count() >= limit) footer = "";
  if (count() >= limit && (shape.top === "band" || shape.bottom === "merge")) top = false;
  if (count() >= limit) bottom = false;
  if (count() >= limit) top = false;
  const contentRows = Number.isFinite(limit) ? Math.max(0, limit - count()) : MAX_COMPOSER_CONTENT_ROWS;
  return { top, bottom, gap, footer, contentRows: Math.min(MAX_COMPOSER_CONTENT_ROWS, contentRows) };
}

/** Status stays owned by its shape: full band, embedded border, or right chip. */
export function topChrome(shape: ComposerShape, state: ComposerState, width: number): string {
  if (shape.top === "band") return defaultTheme.bg("statusBandBg", padToWidth(state.status?.full ?? "", width));
  if (shape.top === "round") {
    const status = truncateToWidth(state.status?.full ?? "", Math.max(0, width - 4));
    return defaultTheme.fg("border", "╭─") + status + defaultTheme.fg("border", "─".repeat(Math.max(0, width - 3 - visibleWidth(status))) + "╮");
  }
  const right = shape.statusAttachment === "top-rule-chip" ? state.status?.right : undefined;
  if (!right || width <= 4) return defaultTheme.fg("border", "─".repeat(width));
  const chip = ` ${truncateToWidth(right, width - 4)} `;
  return defaultTheme.fg("border", "─".repeat(width - visibleWidth(chip) - 1)) + defaultTheme.bg("statusBandBg", chip) + defaultTheme.fg("border", "─");
}

export function bottomChrome(shape: ComposerShape, width: number): string {
  return defaultTheme.fg("border", shape.bottom === "merge" ? `╰${"─".repeat(width - 2)}╯` : "─".repeat(width));
}
