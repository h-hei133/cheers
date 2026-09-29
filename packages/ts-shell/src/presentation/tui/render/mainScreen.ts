/**
 * Painting to the terminal's own screen, with its scrollback left intact.
 *
 * The alternate screen is the other mode: a private screen the surface owns, no
 * scrollback, and leaving it restores whatever the user had. That is the right
 * default for a full-screen application, and the wrong one for a conversation —
 * anything that scrolled past is gone, and a session that ends leaves nothing
 * behind to scroll back through.
 *
 * Here the transcript is appended to the terminal's scrollback and the fixed
 * block at the bottom is redrawn in place, by moving the cursor up over it. The
 * terminal owns the history; this owns the last few rows.
 *
 * What that costs, and it is the rule the rest of this file serves: rows that
 * scrolled past cannot be repainted, because writing over one would duplicate it
 * into the scrollback. So the accounting keeps two facts — what is on screen and
 * which of those rows are above the fixed block — and a frame may only ever
 * rewrite rows that are still visible. A row that has left the screen upward is
 * history; the diff stops there.
 *
 * What is deliberately not claimed: this does not reflow history on a width
 * change. Rewriting it would mean taking the screen over, which is the mode this
 * exists to avoid. A resize re-anchors the fixed block against the new width and
 * leaves the history as the terminal wrapped it.
 *
 * The cursor is tracked rather than queried. Terminals do not report their cursor
 * position unsolicited, and asking (DSR) means a round trip with a timeout on a
 * path that runs on every frame. Every write here goes through `moveToRow`, which
 * accounts for what the terminal will do with it, so the tracked row and the real
 * one stay together as long as nothing else writes to the terminal. When
 * something else has — a suspended child process — the caller restores through
 * {@link reanchor}, which re-derives the position from what is on screen rather
 * than trusting the account.
 */

/** Everything this needs from the terminal, so a double can stand in for one. */
export interface MainScreenDevice {
  write(data: string): void;
  getDimensions(): { readonly columns: number; readonly rows: number };
  capabilities: { readonly supportsDec2026Sync: boolean };
}

const SYNC_BEGIN = "\x1b[?2026h";
const SYNC_END = "\x1b[?2026l";
const SHOW_CURSOR = "\x1b[?25h";
const ERASE_LINE = "\x1b[2K";
const ERASE_TO_END_OF_SCREEN = "\x1b[J";
/** Begin synchronized output where the terminal supports it, so a frame lands whole. */
const beginFrame = (device: MainScreenDevice): string =>
  device.capabilities.supportsDec2026Sync ? SYNC_BEGIN : "";
const endFrame = (device: MainScreenDevice): string =>
  device.capabilities.supportsDec2026Sync ? SYNC_END : "";

export class MainScreenPainter {
  /**
   * The rows on screen that are content, top row first.
   *
   * Only rows still on screen are listed. A row that scrolled out of the
   * viewport upward is history and is dropped from this list rather than kept
   * for a rewrite it must never get.
   */
  private visibleContent: readonly string[] = [];
  /** How many leading rows of `visibleContent` are already scrolled away. */
  private scrolled = 0;
  /** Where the cursor is, counted from the first row this painter wrote. */
  private cursorRow = 0;
  /** The rows of the fixed block, as last drawn. */
  private fixedRows: readonly string[] = [];
  private started = false;

  constructor(private readonly device: MainScreenDevice) {}

  /** Put the cursor below the fixed block and hand the cursor back to the user. */
  start(): void {
    this.started = true;
    this.device.write(SHOW_CURSOR);
  }

  /**
   * Draw one frame.
   *
   * `rows` is the whole document and `chromeRows` its fixed tail. Content rows
   * that grew past what the screen holds are appended once and become history;
   * the tail of the content that is still visible, and the fixed block, are
   * rewritten in place.
   */
  paint(rows: readonly string[], chromeRows: readonly string[]): void {
    if (!this.started) return;
    const dimensions = this.device.getDimensions();
    const height = Math.max(1, dimensions.rows);

    // `content` is the document minus the fixed block at its end. The block is
    // subtracted by count rather than by identity: a caller may pass rows whose
    // text repeats, and the block this painter removes is the tail, not
    // whichever rows happen to match.
    const content = rows.length - chromeRows.length > 0
      ? rows.slice(0, rows.length - chromeRows.length)
      : rows;

    // The fixed block is clamped to the screen height. An unclamped block would
    // push the cursor above the top of the screen while this still believes it
    // is at the block's last row, and every later move would be computed from a
    // row that no longer exists.
    const fixed = chromeRows.length > height ? chromeRows.slice(chromeRows.length - height) : chromeRows;
    // The screen holds the fixed block plus whatever content fits above it. When
    // the block is taller than the screen there is no room for content at all.
    const contentCapacity = Math.max(0, height - fixed.length);

    // The accounting, in the order the facts are established.
    //
    // `writtenTotal` is how many content rows the terminal has ever seen:
    // history plus what is still on screen. Rows beyond it are new and get
    // appended once; rows below it are either history (out of reach) or on
    // screen (rewritable), and the two are separated by how many rows the
    // screen can hold below the fixed block.
    const writtenTotal = this.scrolled + this.visibleContent.length;
    const appendRows = content.length > writtenTotal ? content.slice(writtenTotal) : [];
    const overflow = Math.max(0, content.length - contentCapacity);
    const newScrolled = Math.max(this.scrolled, overflow);
    const onScreenContent = content.length > newScrolled ? content.slice(newScrolled) : [];

    // The previous frame's on-screen rows, adjusted for anything that scrolled
    // out during this one. The two lists compared below both cover only rows
    // that are on screen now.
    const scrolledNow = Math.max(0, newScrolled - this.scrolled);
    const previousOnScreen = this.visibleContent.slice(Math.min(scrolledNow, this.visibleContent.length));

    let buffer = beginFrame(this.device);
    if (appendRows.length > 0) {
      // Appending happens at the bottom of the content, which means stepping
      // over the fixed block to reach it. `writtenTotal` is that bottom, and it
      // is the cursor's own account rather than the fixed block's last row,
      // because the two differ and the append has to land on the row that is
      // actually free.
      buffer += this.moveToRow(writtenTotal);
      for (const row of appendRows) {
        buffer += `${ERASE_LINE}${row}\r\n`;
      }
      // Each appended row ended with a newline, so the cursor is now one row
      // past the last of them — which is where the frame's accounting expects
      // to find it when it moves to the fixed block below.
      this.cursorRow = writtenTotal + appendRows.length;
    }

    // Rows that changed while already on screen are rewritten in place. Only
    // rows both frames show are compared: a row this frame appended was
    // written a moment ago, and rewriting it would put a second copy in the
    // scrollback.
    const sharedContent = Math.min(previousOnScreen.length, onScreenContent.length);
    const changedFrom = firstDifference(
      previousOnScreen.slice(0, sharedContent),
      onScreenContent.slice(0, sharedContent),
    );
    if (changedFrom < sharedContent) {
      buffer += this.moveToRow(newScrolled + changedFrom);
      for (let index = changedFrom; index < sharedContent; index++) {
        buffer += `${ERASE_LINE}${onScreenContent[index] ?? ""}`;
        // A newline between rows moves the cursor down; a trailing one would
        // step past the last row and leave the account one ahead of the
        // terminal for every move that follows.
        if (index < sharedContent - 1) buffer += "\r\n";
      }
      // The rewrite left the cursor on the last row it wrote, which is the
      // row the accounting names.
      this.cursorRow = newScrolled + sharedContent - 1;
    }

    // The content shrank with nothing appended: rows the previous frame used
    // and this one does not are erased, not rewritten — the rows are leaving.
    //
    // The erase starts on the row *after* the last one the content keeps,
    // because the last row of the content is real and erasing from it would
    // clear a row the frame just wrote. It clears the fixed block too, so the
    // block is redrawn below on this path rather than only when its own diff
    // says it changed.
    if (appendRows.length === 0 && previousOnScreen.length > onScreenContent.length) {
      // Erase downward from the first row the content no longer keeps. The
      // cursor is on the last kept row after a rewrite, so one explicit
      // descent reaches it; erasing there clears the dropped rows and the
      // fixed block, which is redrawn below on this path.
      buffer += this.moveToRow(newScrolled + Math.max(0, onScreenContent.length - 1));
      buffer += onScreenContent.length > 0 ? "\x1b[B" : "";
      buffer += ERASE_TO_END_OF_SCREEN;
      this.fixedRows = [];
      this.cursorRow = newScrolled + onScreenContent.length;
    }

    // The fixed block, redrawn under the content wherever it changed.
    if (fixed.length > 0 || this.fixedRows.length > 0) {
      buffer += this.moveToRow(newScrolled + onScreenContent.length);
      for (let index = 0; index < fixed.length; index++) {
        buffer += `${ERASE_LINE}${fixed[index] ?? ""}`;
        if (index < fixed.length - 1) buffer += "\r\n";
      }
      if (this.fixedRows.length > fixed.length) buffer += ERASE_TO_END_OF_SCREEN;
    }

    buffer += endFrame(this.device);
    this.device.write(buffer);

    this.visibleContent = onScreenContent;
    this.scrolled = newScrolled;
    this.fixedRows = fixed;
    this.cursorRow = this.scrolled + this.visibleContent.length + Math.max(0, fixed.length - 1);
  }

  /**
   * Re-derive the account after something else wrote to the terminal.
   *
   * A suspended child can move the cursor anywhere, so the tracked row and the
   * real one have drifted apart and no relative move computed from the account
   * can be trusted. This asks the caller where the cursor really is and resumes
   * from there: the rows already written are left alone — they are in the
   * scrollback or still on screen — and the next frame diffs against them.
   */
  reanchor(cursorRow: number): void {
    this.cursorRow = cursorRow;
  }

  /**
   * Leave the screen as the user should find it.
   *
   * There is no screen to give back — this never took one. The cursor is placed
   * below everything written so the shell prompt continues the history rather
   * than overwriting it.
   */
  stop(): void {
    if (!this.started) return;
    this.started = false;
    const total = this.scrolled + this.visibleContent.length + this.fixedRows.length;
    this.device.write(`${this.moveToRow(total)}\r\n${SHOW_CURSOR}`);
  }

  /** For a device that wants to know whether a repaint is worth attempting. */
  get trackedRows(): number {
    return this.scrolled + this.visibleContent.length + this.fixedRows.length;
  }

  /**
   * Move the cursor to a row, relative to where it is.
   *
   * Relative moves only: the terminal's own row numbering is not this painter's
   * to assume, because the session did not start at the top of the screen.
   */
  private moveToRow(row: number): string {
    const delta = row - this.cursorRow;
    if (delta === 0) return "\r";
    return delta > 0 ? `\x1b[${delta}B\r` : `\x1b[${-delta}A\r`;
  }
}

/** The first index where two lists differ, or the end of the shorter one. */
function firstDifference<T>(left: readonly T[], right: readonly T[]): number {
  const shared = Math.min(left.length, right.length);
  for (let index = 0; index < shared; index++) {
    if (left[index] !== right[index]) return index;
  }
  return shared;
}
