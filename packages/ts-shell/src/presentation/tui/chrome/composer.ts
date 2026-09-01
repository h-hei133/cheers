import { defaultTheme } from "../../theme/theme.js";
import type { Editor } from "../editor.js";
import { padToWidth } from "../text/layout.js";
import { visibleWidth } from "../text/measure.js";

/**
 * Prompt block.
 *
 * A single curved cue marks where input begins; continuation rows align under
 * it. There is no surrounding frame, which means every column of the terminal is
 * available to the text and a one-cell width miscalculation cannot break a
 * border — the failure mode that makes framed composers look broken on CJK input.
 */

const CUE = "╰─ ";
const CONTINUATION = "   ";

export interface ComposerState {
  /** True while a turn is running, which shows the queued-input affordance. */
  readonly busy: boolean;
  /** Number of prompts queued behind the running turn. */
  readonly queued: number;
}

/** Cells available to prompt text at a terminal width. */
export function composerTextWidth(width: number): number {
  return Math.max(8, width - visibleWidth(CUE));
}

/** Prompt rows for the current editor contents. */
export function renderComposer(editor: Editor, state: ComposerState, width: number): string[] {
  const textWidth = composerTextWidth(width);
  const rows = editor.render(textWidth);
  const cue = state.busy ? defaultTheme.fg("warning", CUE) : defaultTheme.fg("accent", CUE);
  const rendered = rows.map((row, index) => (index === 0 ? cue : CONTINUATION) + row);
  if (state.queued > 0) {
    rendered.push(defaultTheme.dim(`   ${state.queued} queued`));
  }
  return rendered.map((row) => padToWidth(row, width));
}
