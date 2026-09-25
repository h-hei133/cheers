import { defaultTheme } from "../../theme/theme.js";
import type { Editor } from "../editor.js";
import { truncateToWidth } from "../text/layout.js";
import { visibleWidth } from "../text/measure.js";
import { highlightSelection, type SelectionSpan } from "../transcript/selection.js";

/**
 * Prompt block.
 *
 * A single curved cue marks where input begins; continuation rows align under
 * it. There is no surrounding frame, which means every column of the terminal is
 * available to the text and a one-cell width miscalculation cannot break a
 * border — the failure mode that makes framed composers look broken on CJK input.
 */

const CUE = "╰─ ";
/**
 * Wrapped rows start in the first column, like everything else. Aligning them
 * under the cue would put three cells in front of every continued line, and those
 * cells come along when the draft is copied.
 */
const CONTINUATION = "";

export interface ComposerState {
  /** True while a turn is running, which shows the queued-input affordance. */
  readonly busy: boolean;
}

/** Cells available to prompt text at a terminal width. */
export function composerTextWidth(width: number): number {
  return Math.max(8, width - visibleWidth(CUE));
}

/** Prompt rows for the current editor contents. */
export function renderComposer(
  editor: Editor,
  state: ComposerState,
  width: number,
  maxRows?: number,
  selection?: SelectionSpan,
): string[] {
  const textWidth = composerTextWidth(width);
  const rows = editor.render(textWidth, maxRows);
  const cue = state.busy ? defaultTheme.fg("warning", CUE) : defaultTheme.fg("accent", CUE);
  // The editor renders the placeholder as plain text, so the colour is applied
  // here, where the theme is already in hand. The editor is a layout module that
  // measures and wraps characters and has no business knowing a palette; a
  // hardcoded grey in it meant a theme's muted colour did not reach the hint.
  const showingPlaceholder = editor.getText() === "" && editor.placeholder !== undefined;
  const styled = showingPlaceholder ? rows.map((row) => defaultTheme.dim(row)) : rows;
  // No trailing padding: the renderer erases to the end of each row anyway, and
  // padding is what turns a multi-row selection into text separated by runs of
  // spaces when the user copies it out of the terminal.
  const rendered = styled.map((row, index) => truncateToWidth((index === 0 ? cue : CONTINUATION) + row, width));
  if (!selection) return rendered;
  return highlightSelection(rendered, selection, true);
}
