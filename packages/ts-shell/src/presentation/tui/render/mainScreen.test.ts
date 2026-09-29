import { describe, expect, it } from "vitest";
import { MainScreenPainter, type MainScreenDevice } from "./mainScreen.js";

/**
 * Painting to the terminal's own screen.
 *
 * Asserting on the bytes written would not answer the question this mode exists
 * to answer: whether content lands in the terminal's scrollback once and stays
 * there. A painter that repainted history would produce similar-looking output
 * and be useless after the session ended. So the double below interprets the
 * control sequences it is given and keeps a screen and a scrollback apart, and
 * the assertions are made against those.
 */

/** A terminal that interprets what is written to it, enough to tell the two apart. */
class Screen {
  readonly scrollback: string[] = [];
  private rows: string[] = [];
  private row = 0;
  private column = 0;
  private started = false;

  constructor(
    private columns = 40,
    private readonly height = 10,
    private readonly sync = true,
  ) {}

  write(data: string): void {
    for (let index = 0; index < data.length; index++) {
      const rest = data.slice(index);
      // Private modes are written `\x1b[?...` and must be matched too, or their
      // bytes leak into the rows the assertions read.
      const escape = /^\x1b\[[?]?(\d*)([A-Za-z])/.exec(rest);
      if (escape) {
        const final = escape[2]!;
        if (!rest.startsWith("\x1b[?")) this.applySequence(Number(escape[1] || 1), final);
        index += escape[0].length - 1;
        continue;
      }
      const character = data[index]!;
      if (character === "\r") {
        this.column = 0;
        continue;
      }
      if (character === "\n") {
        this.newline();
        continue;
      }
      this.put(character);
    }
  }

  resize(columns: number): void {
    this.columns = columns;
  }

  /** Every row the terminal has ever scrolled off, plus what is on screen. */
  allLines(): string[] {
    return [...this.scrollback, ...this.rows].map((line) => line.trimEnd());
  }

  countInScrollback(text: string): number {
    return this.scrollback.filter((line) => line.trim() === text).length;
  }

  countOnScreen(text: string): number {
    return this.rows.filter((line) => line.trim() === text).length;
  }

  private applySequence(count: number, final: string): void {
    if (final === "A") this.row = Math.max(0, this.row - count);
    else if (final === "B") this.row += count;
    else if (final === "K") this.rows[this.row] = "";
    else if (final === "J") for (let r = this.row; r < this.height; r++) this.rows[r] = "";
    else if (final === "h" || final === "l") this.started = true;
    this.ensureRow();
  }

  private put(character: string): void {
    this.ensureRow();
    const current = this.rows[this.row] ?? "";
    const padded = current.padEnd(this.column, " ");
    this.rows[this.row] = padded.slice(0, this.column) + character + padded.slice(this.column + 1);
    this.column += 1;
  }

  private newline(): void {
    this.column = 0;
    this.row += 1;
    if (this.row >= this.height) {
      // Scrolling is what moves a row out of the screen and into the history.
      const leaving = this.rows.shift() ?? "";
      this.scrollback.push(leaving);
      this.row = this.height - 1;
      this.rows[this.height - 1] = "";
    }
    this.ensureRow();
  }

  private ensureRow(): void {
    while (this.rows.length <= this.row) this.rows.push("");
  }

  asDevice(): MainScreenDevice {
    return {
      write: (data: string) => this.write(data),
      getDimensions: () => ({ columns: this.columns, rows: this.height }),
      capabilities: { supportsDec2026Sync: this.sync },
    };
  }

  get sawAlternateScreen(): boolean {
    return this.started;
  }

  /**
   * Where the terminal's cursor actually is, as a screen row.
   *
   * The painter keeps its own account and moves relative to it; the two drifting
   * apart is invisible in the byte stream but corrupts every later frame, so the
   * account is checked against this rather than against itself.
   */
  get cursorScreenRow(): number {
    return this.row;
  }
}

describe("MainScreenPainter", () => {
  it("puts content in the scrollback, not merely on screen", () => {
    // The property the mode exists for: after the session ends the conversation
    // is still there to scroll back through.
    const terminal = new Screen();
    const painter = new MainScreenPainter(terminal.asDevice());
    painter.start();

    painter.paint(
      [..."one two three four five six seven eight nine ten eleven".split(" "), "chrome"],
      ["chrome"],
    );
    painter.paint(
      [..."one two three four five six seven eight nine ten eleven".split(" "), "chrome"],
      ["chrome"],
    );

    // Eleven rows in a ten-row terminal: the first has scrolled off.
    expect(terminal.scrollback).toContain("one");
    expect(terminal.countInScrollback("one")).toBe(1);
  });

  it("writes a content row once no matter how many frames follow", () => {
    const terminal = new Screen();
    const painter = new MainScreenPainter(terminal.asDevice());
    painter.start();

    for (let index = 0; index < 5; index++) {
      painter.paint(["one", "two", "chrome"], ["chrome"]);
    }

    const occurrences = terminal.allLines().filter((line) => line === "one").length;
    expect(occurrences).toBe(1);
  });

  it("keeps the fixed block off the scrollback across many frames", () => {
    // The block is redrawn in place. Appending it would add a copy of the prompt
    // to the history on every keystroke.
    const terminal = new Screen();
    const painter = new MainScreenPainter(terminal.asDevice());
    painter.start();

    for (let index = 0; index < 6; index++) {
      painter.paint(["one", "prompt>"], ["prompt>"]);
    }

    expect(terminal.countInScrollback("prompt>")).toBe(0);
    expect(terminal.countOnScreen("prompt>")).toBe(1);
  });

  it("appends only rows it has not written yet", () => {
    const terminal = new Screen();
    const painter = new MainScreenPainter(terminal.asDevice());
    painter.start();

    painter.paint(["one"], ["chrome"]);
    painter.paint(["one", "two", "chrome"], ["chrome"]);

    const lines = terminal.allLines();
    expect(lines.filter((line) => line === "one")).toHaveLength(1);
    expect(lines.filter((line) => line === "two")).toHaveLength(1);
  });

  it("never enters the alternate screen", () => {
    const terminal = new Screen();
    const painter = new MainScreenPainter(terminal.asDevice());
    painter.start();
    painter.paint(["one"], ["chrome"]);
    painter.stop();

    expect(terminal.sawAlternateScreen).toBe(false);
  });

  it("moves back up over the block before redrawing it", () => {
    const written: string[] = [];
    const device: MainScreenDevice = {
      write: (data) => written.push(data),
      getDimensions: () => ({ columns: 40, rows: 10 }),
      capabilities: { supportsDec2026Sync: true },
    };
    const painter = new MainScreenPainter(device);
    painter.start();
    painter.paint(["one", "a", "b"], ["a", "b"]);
    written.length = 0;
    painter.paint(["one", "a", "b"], ["a", "b"]);

    // The cursor is left on the block's last row, so returning to its first row
    // is one move up — and without it the redraw would append a second copy of
    // the block to the history instead of replacing the first.
    expect(written.join("")).toContain("\x1b[1A");
  });

  it("clears rows the previous block used and the new one does not", () => {
    const written: string[] = [];
    const device: MainScreenDevice = {
      write: (data) => written.push(data),
      getDimensions: () => ({ columns: 40, rows: 10 }),
      capabilities: { supportsDec2026Sync: true },
    };
    const painter = new MainScreenPainter(device);
    painter.start();
    painter.paint(["one", "a", "b", "c"], ["a", "b", "c"]);
    written.length = 0;
    painter.paint(["one", "a"], ["a"]);

    expect(written.join("")).toContain("\x1b[J");
  });

  it("places the cursor below everything it wrote on stop", () => {
    const written: string[] = [];
    const device: MainScreenDevice = {
      write: (data) => written.push(data),
      getDimensions: () => ({ columns: 40, rows: 10 }),
      capabilities: { supportsDec2026Sync: true },
    };
    const painter = new MainScreenPainter(device);
    painter.start();
    painter.paint(["one", "two", "chrome"], ["chrome"]);
    written.length = 0;
    painter.stop();

    expect(written.join("")).toContain("\r\n");
    expect(written.join("")).toContain("\x1b[?25h");
  });

  it("does nothing before start or after stop", () => {
    const written: string[] = [];
    const device: MainScreenDevice = {
      write: (data) => written.push(data),
      getDimensions: () => ({ columns: 40, rows: 10 }),
      capabilities: { supportsDec2026Sync: true },
    };
    const painter = new MainScreenPainter(device);
    painter.paint(["one", "chrome"], ["chrome"]);
    expect(written).toEqual([]);

    painter.start();
    painter.stop();
    written.length = 0;
    painter.paint(["one", "chrome"], ["chrome"]);
    expect(written).toEqual([]);
  });

  it("omits the synchronized-output wrapper when the terminal lacks it", () => {
    const written: string[] = [];
    const device: MainScreenDevice = {
      write: (data) => written.push(data),
      getDimensions: () => ({ columns: 40, rows: 10 }),
      capabilities: { supportsDec2026Sync: false },
    };
    const painter = new MainScreenPainter(device);
    painter.start();
    painter.paint(["one", "chrome"], ["chrome"]);

    expect(written.join("")).not.toContain("\x1b[?2026h");
  });

  it("rewrites a row that grew, instead of appending a second copy", () => {
    // The frame composes the whole document each time, so a row that changed is
    // at the same position in both frames. Skipping the rewrite would leave the
    // terminal showing the shorter text forever, and appending it would put two
    // copies in the scrollback.
    const terminal = new Screen();
    const painter = new MainScreenPainter(terminal.asDevice());
    painter.start();

    painter.paint(["hel", "chrome"], ["chrome"]);
    painter.paint(["hello world", "chrome"], ["chrome"]);

    const lines = terminal.allLines();
    expect(lines.filter((line) => line.includes("hello world"))).toHaveLength(1);
    expect(lines.filter((line) => line === "hel")).toHaveLength(0);
  });

  it("erases the rows a shrunken frame no longer uses", () => {
    // Collapsing a block leaves fewer content rows. The ones that went must
    // leave the screen: the row the frame still wants stays, and the rows it
    // dropped appear nowhere — not above the fixed block, and not a second
    // time in the scrollback.
    const terminal = new Screen();
    const painter = new MainScreenPainter(terminal.asDevice());
    painter.start();

    painter.paint(["one", "two", "three", "chrome"], ["chrome"]);
    painter.paint(["one", "chrome"], ["chrome"]);

    const lines = terminal.allLines();
    expect(lines.filter((line) => line === "one")).toHaveLength(1);
    // The rows that left are gone from both the screen and the scrollback.
    expect(terminal.countOnScreen("two")).toBe(0);
    expect(terminal.countOnScreen("three")).toBe(0);
    expect(terminal.countInScrollback("two")).toBe(0);
    expect(terminal.countInScrollback("three")).toBe(0);
    // The block stayed on the screen.
    expect(terminal.countOnScreen("chrome")).toBe(1);
  });

  it("keeps its cursor account on the row it actually wrote", () => {
    // The account and the terminal's cursor are one fact. A frame that leaves
    // them apart makes every later move land on the wrong row: the row the
    // previous frame wrote is overwritten and the new one is lost. Frames with
    // no fixed block are exactly where that used to happen, because the account
    // was recomputed from the frame's shape and the recomputation was off by
    // one only in that case.
    const terminal = new Screen();
    const painter = new MainScreenPainter(terminal.asDevice());
    painter.start();
    const start = terminal.cursorScreenRow;

    const frames: Array<[string[], string[]]> = [
      [["one", "two", "three"], []],
      [["one", "two", "three!"], []],
      [["one", "two", "three!"], []],
      [["one", "two", "three!", "four"], []],
      [["one", "two", "three!", "four"], ["chrome"]],
      [["one", "two", "three!", "four", "five"], ["chrome"]],
    ];
    for (const [rows, chrome] of frames) {
      painter.paint(rows, chrome);
      const tracked = painter.trackedCursorRow;
      expect(terminal.cursorScreenRow).toBe(tracked + start);
    }
  });

  it("never overwrites a row it wrote when the next frame appends", () => {
    // The failure the account causes, stated as the user sees it: a row of the
    // transcript disappears.
    const terminal = new Screen();
    const painter = new MainScreenPainter(terminal.asDevice());
    painter.start();

    painter.paint(["alpha", "beta", "gamma"], []);
    painter.paint(["alpha", "beta", "gamma", "delta"], []);

    const lines = terminal.allLines();
    for (const row of ["alpha", "beta", "gamma", "delta"]) {
      expect(lines.filter((line) => line === row), `${row} was lost`).toHaveLength(1);
    }
  });

  it("paints every row of a document whose fixed block was passed alongside it", () => {
    // The producer hands the painter the document and the block separately, and
    // the document carries the block at its end. Getting that shape wrong drops
    // the last rows of the transcript without an error anywhere — the screen
    // simply stops one block too early.
    const terminal = new Screen();
    const painter = new MainScreenPainter(terminal.asDevice());
    painter.start();

    painter.paint(["t1", "t2", "block-a", "block-b"], ["block-a", "block-b"]);

    for (const row of ["t1", "t2", "block-a", "block-b"]) {
      expect(terminal.allLines().filter((line) => line === row), `${row} missing`).toHaveLength(1);
    }
  });

  it("keeps drawing after the width changes", () => {
    // Rows that scrolled past cannot be repainted without taking the screen
    // over, so a resize re-anchors and redraws the block rather than reflowing.
    const terminal = new Screen(20);
    const painter = new MainScreenPainter(terminal.asDevice());
    painter.start();
    painter.paint(["one"], ["chrome"]);

    terminal.resize(60);
    painter.paint(["one", "two", "chrome"], ["chrome"]);

    expect(terminal.countOnScreen("chrome")).toBe(1);
  });
});
