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

import { cursorTarget, paintBegin, paintEnd, prepareRows } from "./paint.js";

/** Everything this needs from the terminal, so a double can stand in for one. */
export interface MainScreenDevice {
  write(data: string, onWritten?: () => void): void;
  getDimensions(): { readonly columns: number; readonly rows: number };
  capabilities: { readonly supportsDec2026Sync: boolean };
}

const SHOW_CURSOR = "\x1b[?25h";
const ERASE_LINE = "\x1b[2K";
const ERASE_TO_END_OF_SCREEN = "\x1b[J";

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
  /**
   * Set while a child process holds the terminal, cleared by the first frame
   * after it returns.
   *
   * There is one thing the painter cannot know across a child: how many rows it
   * wrote. So the frame after a child does not compute a position from the
   * account at all — it starts writing where the cursor already is, which is
   * the first free row below the child's output.
   */
  private viewportUnplaced = false;
  private documentId?: object;

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
  paint(rows: readonly string[], chromeRows: readonly string[], onWritten?: () => void, documentId?: object): void {
    if (!this.started) return;
    let replacement = '';
    if (documentId !== undefined) {
      if (this.documentId !== undefined && this.documentId !== documentId) replacement = this.replaceDocument();
      this.documentId = documentId;
    }
    const dimensions = this.device.getDimensions();
    const height = Math.max(1, dimensions.rows);
    const width = Math.max(1, dimensions.columns);

    // `content` is the document minus the fixed block at its end. The block is
    // subtracted by count rather than by identity: a caller may pass rows whose
    // text repeats, and the block this painter removes is the tail, not
    // whichever rows happen to match.
    //
    // `>=` and not `>`: the first frame of a session is the block alone, so the
    // document and the block are the same length and the content is empty.
    // Reading that as "no block to remove" left the block in the content, which
    // was appended to the scrollback and then drawn again below — the prompt
    // twice, permanently, on the very first frame of every session.
    const rawContent = rows.length >= chromeRows.length
      ? rows.slice(0, rows.length - chromeRows.length)
      : rows;

    // The fixed block is clamped to the screen height. An unclamped block would
    // push the cursor above the top of the screen while this still believes it
    // is at the block's last row, and every later move would be computed from a
    // row that no longer exists.
    const rawFixed = chromeRows.length > height ? chromeRows.slice(chromeRows.length - height) : chromeRows;
    const fixed = prepareRows(rawFixed, width);
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
    // Immutable scrollback is never painted again. Only prepare rows that can
    // be written this frame, so typing does not parse the entire transcript.
    const appendRows = rawContent.length > writtenTotal ? prepareRows(rawContent.slice(writtenTotal), width) : [];
    const overflow = Math.max(0, rawContent.length - contentCapacity);
    const newScrolled = Math.max(this.scrolled, overflow);
    const onScreenContent = rawContent.length > newScrolled ? prepareRows(rawContent.slice(newScrolled), width) : [];

    // The previous frame's on-screen rows, adjusted for anything that scrolled
    // out during this one. The two lists compared below both cover only rows
    // that are on screen now.
    const scrolledNow = Math.max(0, newScrolled - this.scrolled);
    const previousOnScreen = this.visibleContent.slice(Math.min(scrolledNow, this.visibleContent.length));

    // Every write below goes through `move`, and every move keeps `cursor` in
    // step with the terminal. The account is carried here and assigned once at
    // the end rather than recomputed from the frame's shape: the moves inside a
    // frame are made relative to where the previous one left the cursor, and a
    // frame that ended one row further down than the recomputation believed
    // would put every later move on the wrong row. That is the defect this
    // shape removes — a recomputed account and a relative move cannot disagree
    // if there is only one account.
    // After a child process the account cannot say where the cursor is, because
    // it cannot say how many rows the child wrote. So this frame's first write
    // happens where the cursor already is — the first free row below the child's
    // output — and every move after it is an ordinary relative move from there.
    let cursor = this.viewportUnplaced ? newScrolled + onScreenContent.length : this.cursorRow;
    this.viewportUnplaced = false;
    const move = (row: number): string => {
      const delta = row - cursor;
      cursor = row;
      if (delta === 0) return "\r";
      return delta > 0 ? `\x1b[${delta}B\r` : `\x1b[${-delta}A\r`;
    };

    let buffer = paintBegin(this.device.capabilities.supportsDec2026Sync) + replacement;
    if (appendRows.length > 0) {
      // Appending happens at the bottom of the content, which means stepping
      // over the fixed block to reach it. `writtenTotal` is that bottom, and it
      // is the cursor's own account rather than the fixed block's last row,
      // because the two differ and the append has to land on the row that is
      // actually free.
      buffer += move(writtenTotal);
      for (const row of appendRows) {
        // The newline after each row is what feeds the scrollback: a row written
        // on the screen's last line stays there until a newline pushes it up,
        // and without that push the transcript would stop growing at one screen
        // and the bottom line would be overwritten forever.
        buffer += `${ERASE_LINE}${row}\r\n`;
      }
      // Each appended row ended with a newline, so the cursor is one row past
      // the last of them. That is also the row the fixed block starts on when
      // the frame has one, which is why this is where the block picks up.
      cursor += appendRows.length;
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
      buffer += move(newScrolled + changedFrom);
      for (let index = changedFrom; index < sharedContent; index++) {
        buffer += `${ERASE_LINE}${onScreenContent[index] ?? ""}`;
        // A newline between rows moves the cursor down; a trailing one would
        // step past the last row and leave the account one ahead of the
        // terminal for every move that follows.
        if (index < sharedContent - 1) buffer += "\r\n";
      }
      // The rewrite left the cursor on the last row it wrote, which is the
      // row the accounting names.
      cursor = newScrolled + sharedContent - 1;
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
      const blockTop = newScrolled + onScreenContent.length;
      buffer += move(blockTop);
      if (onScreenContent.length > 0) {
        // A newline rather than a bare down-move: at the screen's last row a
        // down-move does nothing and the erase would start on the row the
        // content still keeps, while a newline scrolls the kept rows into the
        // scrollback and hands back the blank row the erase wants.
        buffer += "\r\n";
        cursor += 1;
      }
      buffer += ERASE_TO_END_OF_SCREEN;
      this.fixedRows = [];
    }

    // The fixed block, redrawn under the content wherever it changed.
    if (fixed.length > 0 || this.fixedRows.length > 0) {
      buffer += move(newScrolled + onScreenContent.length);
      for (let index = 0; index < fixed.length; index++) {
        buffer += `${ERASE_LINE}${fixed[index] ?? ""}`;
        if (index < fixed.length - 1) buffer += "\r\n";
      }
      if (this.fixedRows.length > fixed.length) buffer += ERASE_TO_END_OF_SCREEN;
      if (fixed.length > 0) cursor = newScrolled + onScreenContent.length + fixed.length - 1;
    }

    // Only visible rows can own the caret. Moving through the same account is
    // essential: the next append, redraw or suspension starts from this row.
    const caret = cursorTarget([...rawContent.slice(newScrolled), ...rawFixed], 0, height);
    if (caret) {
      buffer += move(newScrolled + caret.row);
      const column = Math.min(width - 1, caret.column);
      if (column > 0) buffer += `\x1b[${column}C`;
      buffer += SHOW_CURSOR;
    }
    buffer += paintEnd(this.device.capabilities.supportsDec2026Sync);
    this.device.write(buffer, onWritten);

    this.visibleContent = onScreenContent;
    this.scrolled = newScrolled;
    this.fixedRows = fixed;
    // Carried, not recomputed: see `move` above.
    this.cursorRow = cursor;
  }

  /** Clear owned visible rows while leaving earlier native scrollback intact. */
  private replaceDocument(): string {
    const move = this.viewportUnplaced ? '\r' : this.moveToRow(this.scrolled);
    this.visibleContent = [];
    this.scrolled = 0;
    this.cursorRow = 0;
    this.fixedRows = [];
    this.viewportUnplaced = false;
    return move + ERASE_TO_END_OF_SCREEN;
  }

  /**
   * Hand the terminal to a child process, keeping the account.
   *
   * Not {@link stop}: the rows already written stay in the scrollback and the
   * session comes back to them, so the painter survives. All that is needed is
   * for the cursor to start below everything this wrote, so the child's first
   * line continues the history instead of overwriting the fixed block.
   */
  leaveForExternalOutput(): void {
    if (!this.started) return;
    // The block is this painter's own and is redrawn on return, so it is erased
    // rather than left behind: a copy above the child's output would read as a
    // second prompt the session never drew.
    const blockTop = this.scrolled + this.visibleContent.length;
    this.device.write(`${this.moveToRow(blockTop)}${ERASE_TO_END_OF_SCREEN}${SHOW_CURSOR}`);
    this.cursorRow = blockTop;
    // Whatever the child does next, the account cannot follow it: the child
    // writes as many rows as it likes. So the next frame does not compute a
    // position from the account at all; it writes where the cursor already is.
    this.viewportUnplaced = true;
  }

  /**
   * Continue after a child process had the terminal.
   *
   * Every row this painter wrote is still where it wrote it, so how many
   * document rows have been written does not change — that count is what tells
   * the next frame which rows are new. What does change is the window onto
   * them: the child's output now sits under those rows, so the block erased
   * before the handoff is not on screen to be moved back over, and the rows
   * above it are history rather than something to rewrite.
   *
   * Dropping the window is what stops the next frame from appending the whole
   * document a second time — the failure this exists to prevent, and one that
   * is invisible until the user scrolls back and finds the conversation twice.
   */
  resumeAfterExternalOutput(): void {
    if (!this.started) return;
    // Rows already written are a fact about the scrollback and do not change:
    // the count is what tells the next frame which document rows are new. The
    // window this painter had on screen is not a fact any more — the block was
    // erased before the handoff and the rows above it are history now, so
    // rewriting them would put the conversation in the scrollback twice.
    const written = this.scrolled + this.visibleContent.length;
    this.scrolled = written;
    this.visibleContent = [];
    this.fixedRows = [];
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

  /**
   * The row the account says the cursor is on, counted from the first row this
   * painter wrote.
   *
   * Read by tests: the account and the terminal's real cursor drifting apart is
   * invisible in the byte stream and corrupts every later frame, so the two are
   * compared rather than the account being compared against itself.
   */
  get trackedCursorRow(): number {
    return this.cursorRow;
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
