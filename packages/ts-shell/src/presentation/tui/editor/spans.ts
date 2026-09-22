/**
 * Placing text into a draft, and taking it back out again.
 *
 * A yank is different from typing: pressing the key again asks for a *different*
 * cut, not for the same text a second time, so the previous insertion has to be
 * removed before the new one goes in. Removing from a recorded position rather
 * than undoing is deliberate — the yank's edit is not on the undo stack, and
 * undoing it would also take back whatever came before.
 *
 * Kept apart from the editor because it is arithmetic on lines and columns with
 * no knowledge of the draft's other concerns.
 */

export interface DraftText {
  readonly lines: readonly string[];
  readonly row: number;
  readonly column: number;
}

/**
 * Remove `length` characters starting at a position, across lines.
 *
 * A span that reaches the end of a row consumes the line break as well, which is
 * what makes removing a multi-line insertion leave no blank row behind.
 */
export function removeSpan(text: DraftText, start: { readonly row: number; readonly column: number }, length: number): DraftText {
  const lines = [...text.lines];
  let remaining = length;
  let row = start.row;
  let column = start.column;

  while (remaining > 0) {
    const line = lines[row];
    if (line === undefined) break;
    if (column >= line.length) {
      const following = lines[row + 1];
      if (following === undefined) break;
      // Removing a line break joins the rows; deleting the following row outright
      // would discard text the caller never asked to remove.
      lines[row] = line + following;
      lines.splice(row + 1, 1);
      remaining -= 1;
      continue;
    }
    lines[row] = line.slice(0, column) + line.slice(column + 1);
    remaining -= 1;
  }

  return { lines, row: start.row, column: start.column };
}

/** Insert `text` at a position, splitting on its line breaks. */
export function insertSpan(
  draft: DraftText,
  at: { readonly row: number; readonly column: number },
  text: string,
): DraftText {
  const lines = [...draft.lines];
  const line = lines[at.row] ?? "";
  const head = line.slice(0, at.column);
  const tail = line.slice(at.column);
  const inserted = text.split("\n");

  if (inserted.length === 1) {
    lines[at.row] = head + inserted[0]! + tail;
    return { lines, row: at.row, column: at.column + inserted[0]!.length };
  }

  const last = inserted[inserted.length - 1]!;
  lines.splice(at.row, 1, ...inserted.map((part, index) =>
    index === 0 ? head + part : index === inserted.length - 1 ? part + tail : part,
  ));
  return { lines, row: at.row + inserted.length - 1, column: last.length };
}
