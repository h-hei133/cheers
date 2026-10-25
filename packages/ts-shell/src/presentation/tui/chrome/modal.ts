import { defaultTheme } from "../../theme/theme.js";
import { padToWidth, truncateToWidth, wrapToWidth } from "../text/layout.js";
import { visibleWidth } from "../text/measure.js";
import { CURSOR_MARKER } from "../render/paint.js";
import { isFocusable, type Option, type OptionModel } from "./options.js";
import type { ChipStrip } from './chips.js';

/**
 * Full-screen picker.
 *
 * Used where a single row per option is not enough — a session needs its id,
 * age, subject, and outcome; a server needs its health and tool count. The frame
 * is painted on the alternate screen so the transcript underneath is untouched
 * and reappears intact on exit.
 */

const FRAME_ROWS = 8;

export interface ModalChrome {
  readonly title: string;
  readonly empty: string;
  /** Distinguishes a failed load from a genuinely empty set. */
  readonly state?: "loading" | "error";
  /** Rows each option occupies beyond its first. */
  readonly detailRows: number;
  /** Optional extra action hints shown in the footer (e.g. ^D delete · ^R rename). */
  readonly actionHints?: string;
  readonly status?: string;
  readonly onOptionRow?: (row: number, id: string) => void;
  readonly onListRow?: (row: number, from: number, to: number) => void;
  readonly chips?: ChipStrip;
  readonly groupHint?: string;
  readonly onChipRow?: (row: number, id: string, from: number, to: number) => void;
}

/** A full-screen frame exactly `height` rows tall and `width` columns wide. */
export function renderModal(
  model: OptionModel,
  chrome: ModalChrome,
  width: number,
  height: number,
): string[] {
  width = Math.max(0, Math.floor(width));
  height = Math.max(0, Math.floor(height));
  if (width === 0 || height === 0) return [];
  const inner = Math.max(20, width - 2);
  const rows: string[] = [top(chrome.title, model, inner), searchRow(model, inner)];
  const chips = height >= 5 ? chrome.chips : undefined;
  if (chips) {
    for (const span of chips.spans) chrome.onChipRow?.(rows.length, span.id, span.from + 2, span.to + 2);
    rows.push(body(chips.text, inner));
  }
  rows.push(divider(inner));
  const statusRows = chrome.status ? wrapToWidth(chrome.status, inner - 2).slice(0, 2) : [];
  const perOption = 2 + Math.max(0, chrome.detailRows);
  const listRows = Math.max(perOption, height - FRAME_ROWS - statusRows.length - Number(!!chips));
  const capacity = Math.max(1, Math.floor(listRows / perOption));

  if (model.total === 0) {
    const message = chrome.state === "error" ? defaultTheme.fg("error", chrome.empty) : defaultTheme.dim(chrome.empty);
    rows.push(edge(inner), body(message, inner));
  } else {
    const window = model.window(capacity);
    for (let index = window.offset; index < window.offset + window.count; index++) {
      const option = model.visible[index];
      if (!option) break;
      if (index > window.offset) rows.push(edge(inner));
      const optionLines = optionRows(option, index === model.selectedIndex, chrome, inner);
      for (let row = rows.length; row < Math.min(height, rows.length + optionLines.length); row++) {
        chrome.onListRow?.(row, 1, width - 1);
      }
      if (isFocusable(option)) {
        for (let row = rows.length; row < Math.min(height, rows.length + optionLines.length); row++) {
          chrome.onOptionRow?.(row, option.id);
        }
      }
      rows.push(...optionLines);
    }
    if (window.below > 0) rows.push(body(defaultTheme.dim(`↓ ${window.below} more`), inner));
  }

  while (rows.length < height - 2 - statusRows.length) rows.push(edge(inner));
  for (const line of statusRows) rows.push(body(defaultTheme.dim(line), inner));
  rows.push(body(footer(inner, chrome.actionHints, chips ? chrome.groupHint : undefined), inner));
  rows.push(bottom(inner));
  return rows.slice(0, height).map(row => truncateToWidth(row, width));
}

/** One option: a marked headline plus its wrapped detail and note lines. */
function optionRows(option: Option, active: boolean, chrome: ModalChrome, inner: number): string[] {
  const marker = active ? defaultTheme.fg("accent", "▸ ") : "  ";
  const label = active ? defaultTheme.bold(option.label) : option.label;
  const noteText = truncateToWidth(option.note ?? '', Math.max(0, Math.floor((inner - 2) / 2)));
  const noteWidth = noteText ? visibleWidth(noteText) + 2 : 0;
  const note = noteText ? `  ${defaultTheme.fg("border", noteText)}` : "";
  const head = `${padToWidth(truncateToWidth(`${marker}${label}`, inner - 2 - noteWidth), inner - 2 - noteWidth)}${note}`;
  const rows = [body(active ? highlight(head, inner) : head, inner)];
  if (!option.detail || chrome.detailRows === 0) return rows;
  const detailWidth = Math.max(8, inner - 6);
  for (const line of wrapToWidth(option.detail, detailWidth).slice(0, chrome.detailRows)) {
    rows.push(body(`    ${defaultTheme.dim(line)}`, inner));
  }
  return rows;
}

function highlight(text: string, inner: number): string {
  return `${defaultTheme.bgOpen("selectedBg")}${padToWidth(text, inner - 2)}\x1b[0m`;
}

function top(title: string, model: OptionModel, inner: number): string {
  const count = defaultTheme.dim(`(${model.total})`);
  const label = ` ${defaultTheme.bold(title)} ${count} `;
  const fill = Math.max(0, inner - visibleWidth(label));
  return defaultTheme.fg("border", "┌") + label + defaultTheme.fg("border", `${"─".repeat(fill)}┐`);
}

function searchRow(model: OptionModel, inner: number): string {
  const prompt = defaultTheme.fg("accent", "Search: ");
  const contentWidth = Math.max(8, inner - 2 - visibleWidth("Search: "));
  if (!model.filter) {
    const placeholder = defaultTheme.dim(truncateToWidth("Type to filter...", contentWidth));
    return body(`${prompt}${CURSOR_MARKER}${placeholder}`, inner);
  }
  const query = defaultTheme.bold(truncateToWidth(model.filter, contentWidth));
  return body(`${prompt}${query}${CURSOR_MARKER}`, inner);
}

/**
 * The rule between the search row and the list.
 *
 * Drawn in the muted border colour rather than the frame's, so the frame reads
 * as one boundary and this reads as a division inside it. Two rules in the same
 * colour make a panel look like two stacked panels.
 */
function divider(inner: number): string {
  return defaultTheme.fg("borderMuted", `├${"─".repeat(inner)}┤`);
}

function bottom(inner: number): string {
  return defaultTheme.fg("border", `└${"─".repeat(inner)}┘`);
}

function edge(inner: number): string {
  return body("", inner);
}

/** One framed content row, padded so the right border lands on the same column. */
export function modalBody(text: string, inner: number): string {
  const bar = defaultTheme.fg("border", "│");
  return `${bar} ${padToWidth(truncateToWidth(text, inner - 2), inner - 2)} ${bar}`;
}
const body = modalBody;

function footer(inner: number, actionHints?: string, groupHint?: string): string {
  const hints = actionHints ? `  ·  ${actionHints}` : "";
  return defaultTheme.dim(
    truncateToWidth(`${groupHint ? `${groupHint}  ·  ` : ''}type to filter  ·  ↑↓ move  ·  ↵ choose${hints}  ·  esc cancel`, inner - 2),
  );
}
