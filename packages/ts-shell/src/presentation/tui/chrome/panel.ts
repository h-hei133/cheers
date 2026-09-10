import { defaultTheme } from "../../theme/theme.js";
import { padToWidth, truncateToWidth } from "../text/layout.js";
import { visibleWidth } from "../text/measure.js";
import type { Option, OptionModel } from "./options.js";

/**
 * Inline picker.
 *
 * Sits directly above the prompt and leaves the transcript visible, so choosing
 * a model or toggling a status item never costs the user their place in the
 * conversation. Height is bounded by what the caller allots; the list scrolls
 * inside it and says how much it is hiding.
 */

const MARKER_WIDTH = 4;

export interface PanelChrome {
  readonly title: string;
  /** Shown when the option set is empty. */
  readonly empty: string;
  /** True when rows carry a checkbox rather than a single cursor. */
  readonly multiple: boolean;
  /** Hide the match count in the header. */
  readonly hideCount?: boolean;
}

/** Rows for the panel, fitted to `width` and at most `capacity` tall. */
export function renderPanel(
  model: OptionModel,
  chrome: PanelChrome,
  width: number,
  capacity: number,
): string[] {
  const rows: string[] = [renderHeader(model, chrome, width)];
  // Header and footer always cost a row each; an overflow notice costs a third,
  // and forgetting to reserve it is how a bounded panel overruns its budget.
  const chromeRows = model.total > Math.max(1, capacity - 2) ? 3 : 2;
  const listRows = Math.max(1, capacity - chromeRows);
  if (model.total === 0) {
    rows.push(`  ${defaultTheme.dim(chrome.empty)}`);
    rows.push(renderFooter(chrome, width));
    return rows;
  }
  const window = model.window(listRows);
  const labelWidth = measureLabelWidth(model.visible, width);
  for (let index = window.offset; index < window.offset + window.count; index++) {
    const option = model.visible[index];
    if (!option) break;
    rows.push(renderRow(option, index === model.selectedIndex, model, chrome, labelWidth, width));
  }
  if (window.below > 0) rows.push(`  ${defaultTheme.dim(`↓ ${window.below} more`)}`);
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
  const label = option.disabled
    ? defaultTheme.dim(option.label)
    : active
      ? defaultTheme.bold(option.label)
      : option.label;
  // The note is a state word — "restorable", "default", "toggle" — so it is
  // pinned to the right and the detail gives way to it, rather than the note
  // being the first thing a long detail truncates away.
  const RIGHT_PAD = option.note ? 2 : 0;
  const noteWidth = option.note ? visibleWidth(option.note) + RIGHT_PAD : 0;
  const detailWidth = Math.max(0, width - visibleWidth(marker) - labelWidth - noteWidth);
  const detail = option.detail ? defaultTheme.dim(truncateToWidth(option.detail, detailWidth)) : "";
  const head = truncateToWidth(`${marker}${padToWidth(label, labelWidth)}${detail}`, width - noteWidth);
  const note = option.note ? defaultTheme.fg("border", option.note) : "";
  const gap = Math.max(0, width - visibleWidth(head) - visibleWidth(note) - RIGHT_PAD);
  const trailingPad = " ".repeat(RIGHT_PAD);
  const fitted = `${head}${" ".repeat(gap)}${note}${trailingPad}`;
  return active ? `\x1b[48;5;238m${padToWidth(fitted, width)}\x1b[0m` : fitted;
}

/** Cursor arrow, or a checkbox when the picker takes several answers. */
function rowMarker(option: Option, active: boolean, model: OptionModel, chrome: PanelChrome): string {
  if (!chrome.multiple) return active ? `  ${defaultTheme.fg("accent", "▸")} ` : "    ";
  const box = model.isChosen(option.id) ? defaultTheme.fg("success", "◼") : defaultTheme.fg("border", "◻");
  return `  ${box} `;
}

function renderFooter(chrome: PanelChrome, width: number): string {
  const keys = chrome.multiple
    ? ["↑↓ move", "space toggle", "↵ apply", "esc cancel"]
    : ["↑↓ move", "↵ choose", "esc cancel"];
  return defaultTheme.dim(truncateToWidth(`  type to filter  ·  ${keys.join("  ·  ")}`, width));
}

/** Column the detail text starts at, bounded so a long label cannot eat the row. */
function measureLabelWidth(options: readonly Option[], width: number): number {
  let longest = 0;
  for (const option of options) longest = Math.max(longest, visibleWidth(option.label));
  return Math.min(longest + 2, Math.max(8, Math.floor(width / 2) - MARKER_WIDTH));
}
