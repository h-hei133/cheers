import { defaultTheme } from "../../theme/theme.js";
import { padToWidth, truncateToWidth, wrapToWidth } from "../text/layout.js";
import { visibleWidth } from "../text/measure.js";
import type { Option, OptionModel } from "./options.js";

/**
 * Full-screen picker.
 *
 * Used where a single row per option is not enough — a session needs its id,
 * age, subject, and outcome; a server needs its health and tool count. The frame
 * is painted on the alternate screen so the transcript underneath is untouched
 * and reappears intact on exit.
 */

const FRAME_ROWS = 6;

export interface ModalChrome {
  readonly title: string;
  readonly empty: string;
  /** Rows each option occupies beyond its first. */
  readonly detailRows: number;
}

/** A full-screen frame exactly `height` rows tall and `width` columns wide. */
export function renderModal(
  model: OptionModel,
  chrome: ModalChrome,
  width: number,
  height: number,
): string[] {
  const inner = Math.max(20, width - 2);
  const rows: string[] = [top(chrome.title, model, inner)];
  const perOption = 1 + Math.max(0, chrome.detailRows);
  const listRows = Math.max(perOption, height - FRAME_ROWS);
  const capacity = Math.max(1, Math.floor(listRows / perOption));

  if (model.total === 0) {
    rows.push(edge(inner), body(defaultTheme.dim(chrome.empty), inner));
  } else {
    const window = model.window(capacity);
    for (let index = window.offset; index < window.offset + window.count; index++) {
      const option = model.visible[index];
      if (!option) break;
      if (index > window.offset) rows.push(edge(inner));
      rows.push(...optionRows(option, index === model.selectedIndex, chrome, inner));
    }
    if (window.below > 0) rows.push(body(defaultTheme.dim(`↓ ${window.below} more`), inner));
  }

  while (rows.length < height - 2) rows.push(edge(inner));
  rows.push(body(footer(inner), inner));
  rows.push(bottom(inner));
  return rows.slice(0, height);
}

/** One option: a marked headline plus its wrapped detail and note lines. */
function optionRows(option: Option, active: boolean, chrome: ModalChrome, inner: number): string[] {
  const marker = active ? defaultTheme.fg("accent", "▸ ") : "  ";
  const label = active ? defaultTheme.bold(option.label) : option.label;
  const note = option.note ? `  ${defaultTheme.fg("border", option.note)}` : "";
  const head = `${marker}${label}${note}`;
  const rows = [body(active ? highlight(head, inner) : head, inner)];
  if (!option.detail || chrome.detailRows === 0) return rows;
  const detailWidth = Math.max(8, inner - 6);
  for (const line of wrapToWidth(option.detail, detailWidth).slice(0, chrome.detailRows)) {
    rows.push(body(`    ${defaultTheme.dim(line)}`, inner));
  }
  return rows;
}

function highlight(text: string, inner: number): string {
  return `\x1b[48;5;238m${padToWidth(text, inner - 2)}\x1b[0m`;
}

function top(title: string, model: OptionModel, inner: number): string {
  const filter = model.filter ? ` ${defaultTheme.fg("accent", model.filter)}` : "";
  const label = ` ${defaultTheme.bold(title)}${filter} ${defaultTheme.dim(`${model.total}`)} `;
  const fill = Math.max(0, inner - visibleWidth(label));
  return defaultTheme.fg("border", "┌") + label + defaultTheme.fg("border", `${"─".repeat(fill)}┐`);
}

function bottom(inner: number): string {
  return defaultTheme.fg("border", `└${"─".repeat(inner)}┘`);
}

function edge(inner: number): string {
  return body("", inner);
}

/** One framed content row, padded so the right border lands on the same column. */
function body(text: string, inner: number): string {
  const bar = defaultTheme.fg("border", "│");
  return `${bar} ${padToWidth(truncateToWidth(text, inner - 2), inner - 2)} ${bar}`;
}

function footer(inner: number): string {
  return defaultTheme.dim(
    truncateToWidth("type to filter  ·  ↑↓ move  ·  ↵ choose  ·  esc cancel", inner - 2),
  );
}
