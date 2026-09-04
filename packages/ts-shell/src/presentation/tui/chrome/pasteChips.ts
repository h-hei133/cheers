import { defaultTheme } from "../../theme/theme.js";
import type { PasteChip } from "../pastes.js";
import { truncateToWidth } from "../text/layout.js";
import { visibleWidth } from "../text/measure.js";

/**
 * The chip band: one compact card per attachment token still in the draft,
 * rendered directly above the prompt.
 *
 * The card is the visible half of the attachment; the token in the draft is the
 * identity. Delete the token and the card disappears on the next frame — the
 * band derives everything from the draft, so there is no second state machine
 * to keep honest. Cards that no longer fit the width are omitted rather than
 * wrapped; a wrapped card would look like prose, not an attachment.
 */

const GAP = "  ";

/** Rows of the band at `width`; empty when nothing is staged. */
export function renderPasteChips(chips: readonly PasteChip[], width: number): string[] {
  if (chips.length === 0) return [];
  const rows: string[] = [];
  let remaining = width;
  for (const chip of chips) {
    const card = renderCard(chip, width);
    if (visibleWidth(card) > remaining) break;
    rows.push(card);
    remaining -= visibleWidth(card) + GAP.length;
  }
  return rows;
}

/** One card: `│ ⎘ #1 ┊ snippet… ┊ +12 lines │`. */
function renderCard(chip: PasteChip, width: number): string {
  const token = defaultTheme.fg("accent", chip.token);
  const caption = chip.lines > 1 ? `+${chip.lines} lines` : `${chip.chars} chars`;
  const captionStyled = defaultTheme.dim(caption);
  const separator = defaultTheme.fg("border", "┊");
  const fixedCells =
    chipsCells() + visibleWidth(chip.token) + visibleWidth(captionStyled) + 2 * GAP.length;
  const previewWidth = Math.max(6, width - fixedCells);
  const snippet = truncateToWidth(chip.preview, previewWidth);
  return `│${token}${separator}${snippet}${separator}${captionStyled}│`;
}

/** Cells of the two `│` borders and the two `┊` separators. */
function chipsCells(): number {
  return 4;
}