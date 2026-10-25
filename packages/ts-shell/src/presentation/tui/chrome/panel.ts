import { defaultTheme } from "../../theme/theme.js";
import { padToWidth, truncateToWidth, wrapToWidth } from "../text/layout.js";
import { visibleWidth } from "../text/measure.js";
import { neutraliseForDisplay } from "../../../core/text/safety.js";
import { isFocusable, type Option, type OptionModel } from "./options.js";
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
const labelMeasurements = new WeakMap<OptionModel, { revision: number; longest: number; measured: number }>();

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
  /** Painted list rows include disabled labels for wheel routing, without granting click focus. */
  readonly onListRow?: (row: number, from: number, to: number) => void;
  /** A second column, when the surface is wide enough to afford one. */
  readonly detail?: (id: string | undefined) => readonly string[];
  /** A tab strip above the list. */
  readonly chips?: ChipStrip;
  readonly groupHint?: string;
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
  const footer = renderFooterRows(chrome, width, capacity >= 6 ? 3 : capacity >= 4 ? 2 : 1);
  if (capacity === 1) return footer.slice(0, 1);
  const contentCapacity = Math.max(1, capacity - footer.length);
  const rows: string[] = [renderHeader(model, chrome, width)];
  // Header and footer cost fixed rows; an overflow notice costs one more.
  const chips = contentCapacity >= 2 ? chrome.chips : undefined;
  const chipRows = chips ? 1 : 0;
  const listBudget = Math.max(0, contentCapacity - 1 - chipRows);
  const overflow = listBudget > 1 && model.total > listBudget;
  const listRows = Math.max(0, listBudget - (overflow ? 1 : 0));
  if (chips) {
    rows.push(chips.text);
    for (const span of chips.spans) chrome.onChipRow?.(rows.length - 1, span.id, span.from, span.to);
  }
  if (listRows === 0) return [...rows, ...footer];
  if (model.total === 0) {
    const empty = neutraliseForDisplay(chrome.empty);
    const message = chrome.state === "error" ? defaultTheme.fg("error", empty) : defaultTheme.dim(empty);
    rows.push(truncateToWidth(`  ${message}`, width));
    rows.push(...footer);
    return rows;
  }
  const twoColumn = chrome.detail !== undefined && width >= TWO_COLUMN_MIN_WIDTH;
  const listWidth = twoColumn ? Math.max(20, Math.floor(width * 0.45)) : width;
  const detailWidth = twoColumn ? Math.max(0, width - listWidth - 1) : 0;
  const detailLines = (chrome.detail?.(model.current()?.id) ?? []).map(neutraliseForDisplay);
  const previewRows = !twoColumn && listRows >= 4
    ? Math.min(12, listRows - 3, detailLines.length)
    : 0;
  let optionRows = Math.max(1, listRows - previewRows - (previewRows > 0 ? 1 : 0));
  let overflowNotice = overflow;
  if (previewRows > 0 && model.total > optionRows && !overflowNotice) {
    overflowNotice = true;
    optionRows = Math.max(1, optionRows - 1);
  }
  const window = model.window(twoColumn ? listRows : optionRows);
  const labelWidth = measureLabelWidth(model, listWidth);
  const bodyRows = twoColumn
    ? Math.min(listRows, Math.max(window.count, detailLines.length))
    : Math.min(optionRows, window.count);
  for (let rowIndex = 0; rowIndex < bodyRows; rowIndex++) {
    const index = window.offset + rowIndex;
    const option = model.visible[index];
    if (option) chrome.onListRow?.(rows.length, 0, listWidth);
    if (option && isFocusable(option)) chrome.onOptionRow?.(rows.length, option.id, 0, listWidth);
    const row = option ? renderRow(option, index === model.selectedIndex, model, chrome, labelWidth, listWidth) : "";
    rows.push(twoColumn
      ? padToWidth(truncateToWidth(row, listWidth), listWidth) + defaultTheme.fg("border", "│")
        + padToWidth(truncateToWidth(detailLines[rowIndex] ?? "", detailWidth), detailWidth)
      : row);
  }
  if (previewRows > 0) {
    rows.push(truncateToWidth(`  ${defaultTheme.dim("Preview")}`, width));
    for (const line of detailLines.slice(0, previewRows)) {
      rows.push(truncateToWidth(`  ${defaultTheme.dim(line)}`, width));
    }
  }
  if (overflowNotice) rows.push(truncateToWidth(`  ${defaultTheme.dim(`↑ ${window.above} · ↓ ${window.below} more`)}`, width));
  rows.push(...footer);
  return rows;
}

/** Title row, carrying the live filter and the match count. */
function renderHeader(model: OptionModel, chrome: PanelChrome, width: number): string {
  const filter = model.filter ? ` ${defaultTheme.fg("accent", neutraliseForDisplay(model.filter))}` : "";
  const count = chrome.hideCount ? "" : defaultTheme.dim(`${model.total}`);
  const left = `  ${defaultTheme.bold(neutraliseForDisplay(chrome.title))}${filter}`;
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
  const labelText = neutraliseForDisplay(option.label);
  const text = option.labelRole === "command" ? defaultTheme.fg("command", labelText) : labelText;
  const label = option.disabled
    ? defaultTheme.dim(text)
    : active
      ? defaultTheme.bold(text)
      : text;
  // The note is a state word — "restorable", "default", "toggle" — so it is
  // pinned to the right and the detail gives way to it, rather than the note
  // being the first thing a long detail truncates away.
  const RIGHT_PAD = option.note ? 2 : 0;
  const noteText = truncateToWidth(neutraliseForDisplay(option.note ?? ""), Math.max(0, Math.floor(width / 2) - RIGHT_PAD));
  const noteWidth = option.note ? visibleWidth(noteText) + RIGHT_PAD : 0;
  const detailWidth = Math.max(0, width - visibleWidth(marker) - labelWidth - noteWidth);
  const detail = option.detail ? defaultTheme.dim(truncateToWidth(neutraliseForDisplay(option.detail), detailWidth)) : "";
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

function renderFooterRows(chrome: PanelChrome, width: number, maxRows: number): string[] {
  if (chrome.footer) {
    if (width < 20 && chrome.footer.includes('Esc to close')) {
      return [defaultTheme.dim(truncateToWidth('  Esc to close', width))];
    }
    const rows = chrome.groupHint
      ? [defaultTheme.dim(truncateToWidth(`  ${neutraliseForDisplay(chrome.groupHint)}`, width))]
      : [];
    const footerRows = Math.max(1, maxRows - rows.length);
    rows.push(...wrapToWidth(neutraliseForDisplay(chrome.footer), Math.max(1, width - 4)).slice(0, footerRows)
      .map(line => defaultTheme.dim(truncateToWidth(`  ${line}`, width))));
    return rows.slice(0, maxRows);
  }
  const keys = chrome.multiple
    ? ["↑↓ move", "space toggle", "↵ apply", "esc cancel"]
    : ["↑↓ move", "↵ choose", "esc cancel"];
  if (chrome.groupHint) keys.unshift(chrome.groupHint);
  return [defaultTheme.dim(truncateToWidth(`  ${chrome.filterable === false ? '' : 'type to filter  ·  '}${keys.join("  ·  ")}`, width))];
}

/** Column the detail text starts at, bounded so a long label cannot eat the row. */
function measureLabelWidth(model: OptionModel, width: number): number {
  const ceiling = Math.max(8, Math.floor(width / 2) - MARKER_WIDTH);
  let cached = labelMeasurements.get(model);
  if (!cached || cached.revision !== model.optionsRevision) {
    cached = { revision: model.optionsRevision, longest: 2, measured: 0 };
    labelMeasurements.set(model, cached);
  }
  while (cached.measured < model.visible.length && cached.longest < ceiling) {
    cached.longest = Math.max(cached.longest, visibleWidth(model.visible[cached.measured++]!.label) + 2);
  }
  return Math.min(cached.longest, ceiling);
}
