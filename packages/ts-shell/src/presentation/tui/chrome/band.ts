import { defaultTheme } from "../../theme/theme.js";
import { padToWidth, truncateToWidthWithMode } from "../text/layout.js";
import { visibleWidth } from "../text/measure.js";
import { renderStatusItem, type StatusFacts, type StatusItemId } from "./items.js";

/**
 * Status band above the prompt.
 *
 * One filled row carrying the facts the user chose to keep in view. A band rather
 * than a framed line because a filled row costs one screen row and stays legible
 * at any width, while a frame costs two and misaligns the moment a width estimate
 * is off by one cell.
 *
 * Segments drop from the right under width pressure, so the first configured item
 * — the model, by default — is the last thing to go.
 */

const DIVIDER = "▏";

/** The band row at exactly `width` cells. */
export function renderBand(
  facts: StatusFacts,
  items: readonly StatusItemId[],
  width: number,
): string {
  const cells = Math.max(8, width);
  const parts = segments(facts, items);
  let body = join(parts);
  while (parts.length > 1 && visibleWidth(body) > cells - 1) {
    parts.pop();
    body = join(parts);
  }
  if (visibleWidth(body) > cells - 1) body = truncateToWidthWithMode(body, cells - 1, "end");
  return `${defaultTheme.bgOpen("statusBandBg")}${padToWidth(body, cells)}\x1b[0m`;
}

/** Rendered text for each configured item that has something to show. */
function segments(facts: StatusFacts, items: readonly StatusItemId[]): string[] {
  const parts: string[] = [];
  for (const id of items) {
    const text = renderStatusItem(id, facts);
    if (text) parts.push(text);
  }
  // The band would be an empty coloured stripe otherwise, which reads as a bug.
  if (parts.length === 0) parts.push(defaultTheme.fg("statusLineModel", facts.model));
  return parts;
}

function join(parts: readonly string[]): string {
  return parts.join(defaultTheme.fg("border", ` ${DIVIDER} `));
}
