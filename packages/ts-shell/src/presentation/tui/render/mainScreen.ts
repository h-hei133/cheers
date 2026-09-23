/**
 * Painting to the terminal's own screen, with its scrollback left intact.
 *
 * **Experimental: not yet adapted to the whole surface.** What exists is the
 * screen handling — appending the transcript once, never rewriting it, and
 * redrawing the fixed block in place. What is missing is re-anchoring that block
 * as content grows: the fixed block is placed relative to rows already written,
 * and a turn that appends rows without a resize does not move it, so the prompt
 * and the output drift apart while a turn runs. Reached through
 * `tuiMode: "regular"`; the default is the alternate screen, which does not have
 * this problem because it repaints the whole viewport each frame.
 *
 * The alternate screen is the other mode: a private screen the surface owns, no
 * scrollback, and leaving it restores whatever the user had. That is the right
 * default for a full-screen application, and the wrong one for a conversation —
 * anything that scrolled past is gone, and a session that ends leaves nothing
 * behind to scroll back through.
 *
 * Here the transcript is *appended* to the terminal's scrollback, once, and never
 * rewritten. Only the fixed block at the bottom is redrawn in place, by moving the
 * cursor up over it. The terminal owns the history; this owns the last few rows.
 *
 * What that costs: rows that scrolled past cannot be repainted, so a width change
 * cannot reflow them. Rewriting history to fix that would mean taking the screen
 * over, which is the mode this exists to avoid. A resize therefore re-anchors and
 * redraws the fixed block against the new width, and leaves the history as the
 * terminal wrapped it.
 *
 * The cursor is tracked rather than queried. Terminals do not report their cursor
 * position unsolicited, and asking (DSR) means a round trip with a timeout on a
 * path that runs on every frame. Every write here goes through `write`, which
 * accounts for what the terminal will do with it, so the tracked row and the real
 * one stay together as long as nothing else writes to the terminal.
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
  /** Rows already written to the terminal, in order. */
  private written: readonly string[] = [];
  /** How many of the last written rows are the fixed block, and get redrawn. */
  private fixedRows = 0;
  /** Where the cursor is, counted from the first row this painter wrote. */
  private cursorRow = 0;
  private width = 0;
  private started = false;

  constructor(private readonly device: MainScreenDevice) {}

  /** Put the cursor below the fixed block and hand the cursor back to the user. */
  start(): void {
    this.started = true;
    this.width = Math.max(1, this.device.getDimensions().columns);
    this.device.write(SHOW_CURSOR);
  }

  /**
   * Draw one frame.
   *
   * `rows` is the whole surface and `chromeRows` its fixed tail. Rows above the
   * fixed block that have never been written are appended to the scrollback;
   * everything already written stays as it is.
   */
  paint(rows: readonly string[], chromeRows: readonly string[]): void {
    if (!this.started) return;
    const width = Math.max(1, this.device.getDimensions().columns);
    // History cannot be reflowed without owning the screen, so a width change
    // re-anchors: the fixed block is redrawn against the new width and the
    // history is left as the terminal wrapped it.
    this.width = width;
    this.appendNewRows(this.contentRows(rows, chromeRows));
    this.rewriteFixedBlock(chromeRows);
  }

  /**
   * What to append to the scrollback: the frame's rows above its fixed block.
   *
   * The fixed block is never appended — it is redrawn in place — so only the
   * leading rows are history.
   */
  private contentRows(rows: readonly string[], chromeRows: readonly string[]): readonly string[] {
    const content = rows.length - chromeRows.length;
    return content > 0 ? rows.slice(0, content) : [];
  }

  /**
   * Write rows the terminal has not seen, and nothing else.
   *
   * Rows already written are skipped rather than rewritten: on this screen a
   * rewrite would duplicate them into the scrollback, which is the one thing this
   * mode must not do.
   */
  private appendNewRows(content: readonly string[]): void {
    // `written` counts content rows only, so its length is what has already been
    // emitted. The fixed block is not part of it — it is drawn in place, below.
    const alreadyWritten = this.written.length;
    if (content.length <= alreadyWritten) return;

    // New content belongs directly after the content already on screen, which
    // means stepping back over the fixed block drawn beneath it.
    let buffer = beginFrame(this.device) + this.moveToRow(alreadyWritten);
    for (let index = alreadyWritten; index < content.length; index++) {
      buffer += `${ERASE_LINE}${content[index] ?? ""}\r\n`;
    }
    buffer += endFrame(this.device);
    this.device.write(buffer);

    this.written = content;
    // Just below the last content row, because each row ended with a newline.
    this.cursorRow = content.length;
  }

  /**
   * Redraw the fixed block under the content.
   *
   * Erasing each row where it already is, rather than appending it, is what keeps
   * the block "fixed" and out of the scrollback.
   */
  private rewriteFixedBlock(chromeRows: readonly string[]): void {
    if (chromeRows.length === 0 && this.fixedRows === 0) return;
    // The block starts where the content ends.
    let buffer = beginFrame(this.device) + this.moveToRow(this.written.length);
    for (let index = 0; index < chromeRows.length; index++) {
      buffer += `${ERASE_LINE}${chromeRows[index] ?? ""}`;
      if (index < chromeRows.length - 1) buffer += "\r\n";
    }
    // Clear any rows the previous block used and this one does not.
    if (this.fixedRows > chromeRows.length) {
      buffer += ERASE_TO_END_OF_SCREEN;
    }
    buffer += endFrame(this.device);
    this.device.write(buffer);
    this.fixedRows = chromeRows.length;
    // Left on the block's last row, which is where a terminal leaves it too.
    this.cursorRow = this.written.length + Math.max(0, chromeRows.length - 1);
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
    const total = this.written.length + this.fixedRows;
    this.device.write(`${this.moveToRow(total)}\r\n${SHOW_CURSOR}`);
  }

  /** For a device that wants to know whether a repaint is worth attempting. */
  get trackedRows(): number {
    return this.written.length + this.fixedRows;
  }
}
