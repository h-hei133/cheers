import { defaultTheme } from "../../theme/theme.js";
import { padToWidth, truncateToWidth } from "../text/layout.js";
import { visibleWidth } from "../text/measure.js";
import type { Option, OptionModel } from "./options.js";
import type { ChipStrip } from "./chips.js";

/**
 * Inline picker.
 *
 * Sits directly above the prompt and leaves the transcript visible, so choosing
 * a model or toggling a status item never costs the user their place in the
 * conversation. Height is bounded by what the caller allots; the list scrolls
 * inside it and says how much it is hiding.
 */

const MARKER_WIDTH = 4;
const MAX_OPTIONS = 8;

export interface PanelChrome {
  readonly filterable?: boolean;
  readonly title: string;
  /** Shown when the option set is empty. */
  readonly empty: string;
  /** Distinguishes a failed load from a genuinely empty set. */
  readonly state?: "loading" | "error";
  readonly footer?: string;
  /** True when rows carry a checkbox rather than a single cursor. */
  readonly multiple: boolean;
  /** Hide the match count in the header. */
  readonly hideCount?: boolean;
  /** Records selectable rows and their horizontal span in the frame being rendered. */
  readonly onOptionRow?: (row: number, id: string, from?: number, to?: number) => void;
  /** A second column, when the surface is wide enough to afford one. */
  readonly detail?: (id: string | undefined) => readonly string[];
  /** A tab strip above the list. */
  readonly chips?: ChipStrip;
  /** Records clickable chip spans. */
  readonly onChipRow?: (row: number, id: string, from: number, to: number) => void;
}

/** Below this width the detail column is dropped rather than squeezing both. */
const TWO_COLUMN_MIN_WIDTH = 60;

/** Rows for the panel, fitted to `width` and at most `capacity` tall. */
export function renderPanel(
  model: OptionModel,
  chrome: PanelChrome,
  width: number,
  capacity: number,
): string[] {
  capacity = Math.max(0, Math.floor(capacity));
  if (capacity === 0 || width <= 0) return [];
  if (capacity === 1) return [renderFooter(chrome, width)];
  const rows: string[] = [renderHeader(model, chrome, width)];
  // Header and footer always cost a row each; an overflow notice costs a third,
  // and forgetting to reserve it is how a bounded panel overruns its budget.
  const chips = capacity >= 3 ? chrome.chips : undefined;
  const chipRows = chips ? 1 : 0;
  const overflow = capacity >= 4 + chipRows && model.total > Math.min(MAX_OPTIONS, capacity - 2 - chipRows);
  const listRows = Math.min(MAX_OPTIONS, Math.max(0, capacity - (overflow ? 3 : 2) - chipRows));
  if (chips) {
    rows.push(chips.text);
    for (const span of chips.spans) chrome.onChipRow?.(rows.length - 1, span.id, span.from, span.to);
  }
  if (listRows === 0) return [...rows, renderFooter(chrome, width)];
  if (model.total === 0) {
    const message = chrome.state === "error" ? defaultTheme.fg("error", chrome.empty) : defaultTheme.dim(chrome.empty);
    rows.push(truncateToWidth(`  ${message}`, width));
    rows.push(renderFooter(chrome, width));
    return rows;
  }
  const window = model.window(listRows);
  const twoColumn = chrome.detail !== undefined && width >= TWO_COLUMN_MIN_WIDTH;
  const listWidth = twoColumn ? Math.max(20, Math.floor(width * 0.45)) : width;
  const detailWidth = twoColumn ? Math.max(0, width - listWidth - 1) : 0;
  const detailLines = twoColumn ? chrome.detail!(model.current()?.id) : [];
  const labelWidth = measureLabelWidth(model.visible, listWidth);
  for (let index = window.offset; index < window.offset + window.count; index++) {
    const option = model.visible[index];
    if (!option) break;
    if (!option.disabled) chrome.onOptionRow?.(rows.length, option.id, 0, listWidth);
    const row = renderRow(option, index === model.selectedIndex, model, chrome, labelWidth, listWidth);
    rows.push(twoColumn
      ? padToWidth(truncateToWidth(row, listWidth), listWidth) + defaultTheme.fg("border", "│")
        + padToWidth(truncateToWidth(detailLines[index - window.offset] ?? "", detailWidth), detailWidth)
      : row);
  }
  if (overflow) rows.push(truncateToWidth(`  ${defaultTheme.dim(`↑ ${window.above} · ↓ ${window.below} more`)}`, width));
  rows.push(renderFooter(chrome, width));
  return rows;
}

/** Title row, carrying the live filter and the match count. */
function renderHeader(model: OptionModel, chrome: PanelChrome, width: number): string {
  const filter = model.filter ? ` ${defaultTheme.fg("accent", model.filter)}` : "";
  const count = chrome.hideCount ? "" : defaultTheme.dim(`${model.total}`);
  const left = `  ${defaultTheme.bold(chrome.title)}${filter}`;
  if (!count) return truncateToWidth(left, width);
  const pad = Math.max(1, width - visibleWidth(left) - visibleWidth(count) - 2);
  return truncateToWidth(`${left}${" ".repeat(pad)}${count}`, width);
}

function renderRow(
  option: Option,
  active: boolean,
  model: OptionModel,
  chrome: PanelChrome,
  labelWidth: number,
  width: number,
): string {
  const marker = rowMarker(option, active, model, chrome);
  const text = option.labelRole === "command" ? defaultTheme.fg("command", option.label) : option.label;
  const label = option.disabled
    ? defaultTheme.dim(text)
    : active
      ? defaultTheme.bold(text)
      : text;
  // The note is a state word — "restorable", "default", "toggle" — so it is
  // pinned to the right and the detail gives way to it, rather than the note
  // being the first thing a long detail truncates away.
  const RIGHT_PAD = option.note ? 2 : 0;
  const noteText = truncateToWidth(option.note ?? "", Math.max(0, Math.floor(width / 2) - RIGHT_PAD));
  const noteWidth = option.note ? visibleWidth(noteText) + RIGHT_PAD : 0;
  const detailWidth = Math.max(0, width - visibleWidth(marker) - labelWidth - noteWidth);
  const detail = option.detail ? defaultTheme.dim(truncateToWidth(option.detail, detailWidth)) : "";
  const head = truncateToWidth(`${marker}${padToWidth(label, labelWidth)}${detail}`, width - noteWidth);
  const note = option.note ? defaultTheme.fg("border", noteText) : "";
  const gap = Math.max(0, width - visibleWidth(head) - visibleWidth(note) - RIGHT_PAD);
  const trailingPad = " ".repeat(RIGHT_PAD);
  const fitted = truncateToWidth(`${head}${" ".repeat(gap)}${note}${trailingPad}`, width);
  return active ? `${defaultTheme.bgOpen("selectedBg")}${padToWidth(fitted, width)}\x1b[0m` : fitted;
}

/** Cursor arrow, or a checkbox when the picker takes several answers. */
function rowMarker(option: Option, active: boolean, model: OptionModel, chrome: PanelChrome): string {
  if (!chrome.multiple) return active ? `  ${defaultTheme.fg("accent", "▸")} ` : "    ";
  const box = model.isChosen(option.id) ? defaultTheme.fg("success", "◼") : defaultTheme.fg("border", "◻");
  return `  ${box} `;
}

function renderFooter(chrome: PanelChrome, width: number): string {
  if (chrome.footer) return defaultTheme.dim(truncateToWidth(
    visibleWidth(`  ${chrome.footer}`) <= width ? `  ${chrome.footer}` : "Esc to close", width));
  const keys = chrome.multiple
    ? ["↑↓ move", "space toggle", "↵ apply", "esc cancel"]
    : ["↑↓ move", "↵ choose", "esc cancel"];
  return defaultTheme.dim(truncateToWidth(`  ${chrome.filterable === false ? '' : 'type to filter  ·  '}${keys.join("  ·  ")}`, width));
}

/** Column the detail text starts at, bounded so a long label cannot eat the row. */
function measureLabelWidth(options: readonly Option[], width: number): number {
  let longest = 0;
  for (const option of options) longest = Math.max(longest, visibleWidth(option.label));
  return Math.min(longest + 2, Math.max(8, Math.floor(width / 2) - MARKER_WIDTH));
}
