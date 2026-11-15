import { describe, expect, it, vi } from "vitest";
import { MainScreenPainter, type MainScreenDevice } from "./mainScreen.js";
import { CURSOR_MARKER, cursorTarget } from "./paint.js";
import { StartupSurface } from "../../../cli/interactive/startup.js";
import { ManualScheduler, RecordingTerminal } from "../../../test-utils/terminalDouble.js";
import { InteractiveSurface } from "../surface/view.js";
import { stripAnsi } from "../text/ansi.js";
import { inlineImageRows } from '../image.js';
import { pngImage } from '../../../test-utils/image.js';
import { setCellDimensions } from '../imageDimensions.js';

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
  private savedCursor: { readonly row: number; readonly column: number } | undefined;
  private placements = new Map<string, { readonly imageId: number; readonly placementId: number; top: number; readonly rows: number; readonly column: number }>();
  private uploads = new Set<number>();
  private anonymousPlacement = 0;
  private mainScreen: { readonly rows: string[]; readonly row: number; readonly column: number; readonly placements: typeof this.placements; readonly uploads: Set<number> } | undefined;

  constructor(
    private columns = 40,
    private readonly height = 10,
    private readonly sync = true,
    initialRow = 0,
  ) {
    this.rows = Array.from({ length: height }, () => "");
    this.row = Math.max(0, Math.min(height - 1, initialRow));
  }

  write(data: string): void {
    for (let index = 0; index < data.length; index++) {
      const rest = data.slice(index);
      const graphics = /^\x1b_G([^;\x1b]*)(?:;[^\x1b]*)?\x1b\\/.exec(rest);
      if (graphics) { this.applyGraphics(graphics[1]!); index += graphics[0].length - 1; continue; }
      if (rest.startsWith('\x1b7')) { this.savedCursor = { row: this.row, column: this.column }; index++; continue; }
      if (rest.startsWith('\x1b8')) {
        if (this.savedCursor) { this.row = this.savedCursor.row; this.column = this.savedCursor.column; }
        index++; continue;
      }
      const hyperlink = /^\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/.exec(rest);
      if (hyperlink) { index += hyperlink[0].length - 1; continue; }
      // Private modes are written `\x1b[?...` and must be matched too, or their
      // bytes leak into the rows the assertions read.
      const escape = /^\x1b\[([?=>]?)([\d;:]*)([@-~])/.exec(rest);
      if (escape) {
        const parameters = escape[2]!.split(";").map(value => Number(value || 0));
        const final = escape[3]!;
        if (escape[1] === "?" && parameters.includes(1049)) this.alternate(final === "h");
        else if (escape[1] === "") this.applySequence(parameters, final);
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

  screenLines(): readonly string[] { return this.rows.map(line => line.trimEnd()); }

  private alternate(enabled: boolean): void {
    if (enabled && !this.mainScreen) {
      this.started = true;
      this.mainScreen = { rows: this.rows, row: this.row, column: this.column, placements: this.placements, uploads: this.uploads };
      this.placements = new Map(); this.uploads = new Set();
      this.rows = Array.from({ length: this.height }, () => "");
      this.row = 0; this.column = 0;
    } else if (!enabled && this.mainScreen) {
      this.rows = this.mainScreen.rows; this.row = this.mainScreen.row; this.column = this.mainScreen.column;
      this.placements = this.mainScreen.placements; this.uploads = this.mainScreen.uploads;
      this.mainScreen = undefined;
    }
  }

  private applyGraphics(header: string): void {
    const controls = Object.fromEntries(header.split(',').map(control => control.split('=')));
    const imageId = Number(controls.i);
    const placementId = Number(controls.p ?? 0);
    if (controls.a === 'd') {
      for (const [key, image] of this.placements) {
        const selected = controls.d?.toLowerCase() === 'a' ? image.top + image.rows > 0 && image.top < this.height
          : image.imageId === imageId && (controls.p === undefined || image.placementId === placementId);
        if (selected) this.placements.delete(key);
      }
      if (controls.d === 'I') this.uploads.delete(imageId);
      return;
    }
    if (controls.a === 'T') {
      for (const [key, image] of this.placements) if (image.imageId === imageId) this.placements.delete(key);
      this.uploads.add(imageId);
    } else if (controls.a !== 'p') return;
    if (!this.uploads.has(imageId)) return;
    const key = placementId === 0 ? `${imageId}:anonymous:${this.anonymousPlacement++}` : `${imageId}:${placementId}`;
    this.placements.set(key, { imageId, placementId, top: this.row, rows: Number(controls.r ?? 1), column: this.column });
  }

  graphics(): readonly { readonly imageId: number; readonly placementId: number; readonly top: number; readonly rows: number; readonly column: number }[] {
    return [...this.placements.values()].map(image => ({ ...image }));
  }

  private applySequence(parameters: readonly number[], final: string): void {
    const count = Math.max(1, parameters[0] ?? 1);
    if (final === "A") this.row = Math.max(0, this.row - count);
    else if (final === "B") this.row = Math.min(this.height - 1, this.row + count);
    else if (final === "C") this.column = Math.min(this.columns - 1, this.column + count);
    else if (final === "D") this.column = Math.max(0, this.column - count);
    else if (final === "H" || final === "f") {
      this.row = Math.min(this.height - 1, Math.max(1, parameters[0] ?? 1) - 1);
      this.column = Math.min(this.columns - 1, Math.max(1, parameters[1] ?? 1) - 1);
    } else if (final === "K") {
      const mode = parameters[0] ?? 0, line = this.rows[this.row] ?? "";
      this.rows[this.row] = mode === 2 ? "" : mode === 1 ? " ".repeat(this.column + 1) + line.slice(this.column + 1) : line.slice(0, this.column);
    } else if (final === "J") {
      if (parameters[0] === 2 || parameters[0] === 3) this.rows.fill("");
      else {
        this.rows[this.row] = (this.rows[this.row] ?? "").slice(0, this.column);
        for (let row = this.row + 1; row < this.height; row++) this.rows[row] = "";
      }
    }
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
      for (const placement of this.placements.values()) placement.top--;
      if (!this.mainScreen) this.scrollback.push(leaving);
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

  get cursorScreenColumn(): number { return this.column; }
}

describe("physical terminal coordinates", () => {
  it("clamps CUD at the bottom without scrolling and lets LF scroll", () => {
    const screen = new Screen(40, 6, true, 4);
    screen.write("\x1b[99B");
    expect(screen.cursorScreenRow).toBe(5);
    expect(screen.scrollback).toEqual([]);
    expect(screen.screenLines()).toHaveLength(6);
    screen.write("last\r\n");
    expect(screen.cursorScreenRow).toBe(5);
    expect(screen.scrollback).toHaveLength(1);
    expect(screen.screenLines()[4]).toBe("last");
  });

  it("restores the main screen and cursor after alternate-screen CUP and scrolling", () => {
    const screen = new Screen(40, 6, true, 4);
    screen.write("shell> ");
    const main = screen.screenLines();
    screen.write("\x1b[?1049h\x1b[6;3Hloading\r\n\x1b[2;4H");
    expect(screen.cursorScreenRow).toBe(1);
    expect(screen.cursorScreenColumn).toBe(3);
    expect(screen.scrollback).toEqual([]);
    screen.write("\x1b[?1049l");
    expect(screen.screenLines()).toEqual(main);
    expect(screen.cursorScreenRow).toBe(4);
    expect(screen.cursorScreenColumn).toBe(7);
  });
});

describe("startup cursor geometry", () => {
  it.each([
    { origin: "top", row: 0, alternateScreen: false },
    { origin: "middle", row: 8, alternateScreen: false },
    { origin: "bottom", row: 15, alternateScreen: false },
    { origin: "top", row: 0, alternateScreen: true },
    { origin: "middle", row: 8, alternateScreen: true },
    { origin: "bottom", row: 15, alternateScreen: true },
  ])("keeps the adopted draft cursor on its physical prompt from $origin with alternateScreen=$alternateScreen", ({ row, alternateScreen }) => {
    const terminal = new RecordingTerminal(), scheduler = new ManualScheduler();
    terminal.columns = 60; terminal.rows = 16;
    const screen = new Screen(terminal.columns, terminal.rows, true, row);
    screen.write("shell> ");
    vi.spyOn(terminal, "write").mockImplementation((data, onWritten) => {
      terminal.writes.push(data); screen.write(data); onWritten?.();
    });
    const startup = new StartupSurface(terminal, scheduler, vi.fn());
    try {
      terminal.input("retained-draft"); startup.input.flush(); scheduler.flush();
      const draft = startup.state.editor.snapshot();
      expect(draft).toMatchObject({ text: "retained-draft", cursor: "retained-draft".length });
      startup.state.transcript.append({ kind: "notice", text: "welcome-history", finalized: true });
      const view = new InteractiveSurface({
        facts: () => ({ model: "fixture-model", provider: "fixture-provider" }), statusItems: () => ["model"],
        activity: () => undefined, busy: () => false, queuedCount: () => 0, now: () => 0,
        ambient: () => ({ openTodos: 0, peerSessions: 0 }), cancelArmed: () => false,
        overlayFullScreen: () => false, overlayRows: () => [], selection: () => undefined,
      }, startup.state);
      // Production installs the final provider before transferring the startup
      // engine; the alternate screen then restores the original physical row.
      startup.tui.setFrameProvider(view);
      startup.adopt(alternateScreen); startup.tui.renderNow(); scheduler.flush();
      const frame = view.renderFrame(terminal.getDimensions(), alternateScreen ? "viewport" : "document");
      const caret = cursorTarget(frame.rows, 0, terminal.rows);
      expect(caret).not.toBeNull();
      const prompt = stripAnsi(frame.rows[caret!.row]!).replace(CURSOR_MARKER, "").trimEnd();
      const physicalRow = screen.screenLines().findIndex(line => line === prompt);
      expect(physicalRow).toBeGreaterThanOrEqual(0);
      expect(screen.cursorScreenRow).toBe(physicalRow);
      expect(screen.cursorScreenColumn).toBe(caret!.column);
      expect(startup.state.editor.snapshot()).toEqual(draft);
      expect(screen.countOnScreen(prompt)).toBe(1);
      expect(screen.allLines().filter(line => line.includes("retained-draft"))).toHaveLength(1);
      expect(screen.countInScrollback(prompt)).toBe(0);
      expect(screen.allLines().filter(line => line === "welcome-history")).toHaveLength(1);
      expect(screen.allLines().join("\n")).not.toContain("Loading");
      const scrollback = [...screen.scrollback], lines = screen.allLines();
      for (let render = 0; render < 3; render++) {
        startup.tui.requestRender(); scheduler.flush();
        expect(screen.cursorScreenRow).toBe(physicalRow);
        expect(screen.cursorScreenColumn).toBe(caret!.column);
        expect(screen.scrollback).toEqual(scrollback);
        expect(screen.allLines()).toEqual(lines);
        expect(screen.countOnScreen(prompt)).toBe(1);
        expect(startup.state.editor.snapshot()).toEqual(draft);
      }
    } finally { startup.input.dispose(); startup.tui.stop(); startup.dispose(); }
  });
});

describe("MainScreenPainter", () => {
  it.each(['kitty', 'iterm2'] as const)('preclears a complete %s image extent before appending its graphics', protocol => {
    setCellDimensions({ widthPx: 9, heightPx: 18 });
    const terminal = new RecordingTerminal(); terminal.rows = 20;
    const painter = new MainScreenPainter(terminal); painter.start(); terminal.drain();
    const image = pngImage(320, 161);
    const rows = inlineImageRows(image, protocol, 16)!;
    painter.paint([...rows, 'following text', `prompt>${CURSOR_MARKER}`], [`prompt>${CURSOR_MARKER}`]);
    const bytes = terminal.drain();
    const start = protocol === 'kitty' ? bytes.indexOf('\x1b_Ga=T') : bytes.indexOf('\x1b]1337;File=');
    expect(bytes.slice(0, start).match(/\x1b\[2K/g)).toHaveLength(rows.length);
    expect(bytes.slice(start, bytes.indexOf('following text'))).not.toContain('\x1b[2K\r\n\x1b[2K');
    expect(painter.trackedCursorRow).toBe(rows.length + 1);
    painter.paint([...rows, 'following text', `edited>${CURSOR_MARKER}`], [`edited>${CURSOR_MARKER}`]);
    expect(terminal.drain()).not.toContain(image.data);
  });

  it('redraws a complete visible image after clearing a changed covered row', () => {
    setCellDimensions({ widthPx: 9, heightPx: 18 });
    const terminal = new RecordingTerminal(); terminal.rows = 20;
    const painter = new MainScreenPainter(terminal); painter.start();
    const image = pngImage(320, 161);
    const rows = [...inlineImageRows(image, 'kitty', 16)!, 'following text'];
    const chrome = [`prompt>${CURSOR_MARKER}`];
    painter.paint([...rows, ...chrome], chrome); terminal.drain();
    rows[1] = 'changed covered cells';
    painter.paint([...rows, ...chrome], chrome);
    const bytes = terminal.drain();
    expect(bytes).toContain('\x1b_Ga=p');
    expect(bytes).not.toContain(image.data);
    expect(bytes.indexOf('\x1b_Ga=p')).toBeGreaterThan(bytes.lastIndexOf('\x1b[2K'));
    expect(bytes.indexOf('\x1b_Ga=p')).toBeGreaterThan(bytes.indexOf('changed covered cells'));
  });

  it('uses text when a new picture cannot fit on the physical screen', () => {
    setCellDimensions({ widthPx: 9, heightPx: 18 });
    const terminal = new RecordingTerminal(); terminal.rows = 3;
    const painter = new MainScreenPainter(terminal); painter.start();
    const rows = inlineImageRows(pngImage(320, 161), 'kitty', 16)!;
    painter.paint([...rows, 'prompt>'], ['prompt>']);
    const bytes = terminal.drain();
    expect(bytes).not.toContain('\x1b_G');
    expect(bytes).toContain('image (does not fit)');
  });

  it('assigns separate terminal identities to duplicate scrollback images', () => {
    const terminal = new RecordingTerminal(); terminal.rows = 20;
    const painter = new MainScreenPainter(terminal); painter.start();
    const rows = inlineImageRows(pngImage(80, 80), 'kitty', 4)!;
    painter.paint([...rows, 'between', ...rows, 'prompt>'], ['prompt>']);
    const ids = [...terminal.drain().matchAll(/\x1b_Ga=T[^;]*,i=(\d+)/g)].map(match => match[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it('lets native scrolling preserve a partially historical picture through covered-cell repaint', () => {
    setCellDimensions({ widthPx: 9, heightPx: 18 });
    const terminal = new Screen(40, 6);
    const painter = new MainScreenPainter(terminal.asDevice()); painter.start();
    const rows = [...inlineImageRows(pngImage(320, 161), 'kitty', 16)!];
    const chrome = [`prompt>${CURSOR_MARKER}`];
    painter.paint([...rows, ...chrome], chrome);
    expect(terminal.graphics()).toHaveLength(1);
    expect(terminal.graphics()[0]).toMatchObject({ top: 0, rows: 5 });
    rows.push('following'); painter.paint([...rows, ...chrome], chrome);
    const historical = terminal.graphics();
    expect(historical[0]).toMatchObject({ top: -1, rows: 5 });
    rows[2] = 'changed visible cells'; painter.paint([...rows, ...chrome], chrome);
    expect(terminal.graphics()).toEqual(historical);
    expect(terminal.screenLines()).toContain('changed visible cells');
    expect(terminal.cursorScreenRow).toBe(5);
    expect(terminal.cursorScreenColumn).toBe(7);
  });

  it('updates the same visible placement instead of accumulating overlapping copies', () => {
    setCellDimensions({ widthPx: 9, heightPx: 18 });
    const terminal = new Screen(40, 20);
    const painter = new MainScreenPainter(terminal.asDevice()); painter.start();
    const rows = [...inlineImageRows(pngImage(320, 161), 'kitty', 16)!];
    const chrome = [`prompt>${CURSOR_MARKER}`];
    painter.paint([...rows, ...chrome], chrome);
    const placement = terminal.graphics();
    expect(placement).toHaveLength(1);
    expect(placement[0]).toMatchObject({ top: 0, rows: 5, column: 0, placementId: 1 });
    for (let frame = 0; frame < 3; frame++) {
      rows[2] = `covered text ${frame}`;
      painter.paint([...rows, ...chrome], chrome);
      expect(terminal.graphics()).toEqual(placement);
      expect(terminal.screenLines()).toContain(`covered text ${frame}`);
      expect(terminal.cursorScreenRow).toBe(5);
    }
  });

  it('removes a hidden or replaced visible picture with dedicated placement deletion', () => {
    setCellDimensions({ widthPx: 9, heightPx: 18 });
    const terminal = new Screen(40, 20);
    const painter = new MainScreenPainter(terminal.asDevice()); painter.start();
    const first = inlineImageRows(pngImage(320, 161), 'kitty', 16)!;
    const second = inlineImageRows(pngImage(320, 161, 'replacement'), 'kitty', 16)!;
    const chrome = ['prompt>'];
    painter.paint([...first, ...chrome], chrome);
    const original = terminal.graphics()[0]!.imageId;
    painter.paint([...second, ...chrome], chrome);
    expect(terminal.graphics()).toHaveLength(1);
    expect(terminal.graphics()[0]!.imageId).not.toBe(original);
    painter.paint([...Array<string>(first.length).fill(''), ...chrome], chrome);
    expect(terminal.graphics()).toEqual([]);
  });

  it.each([false, true])('retires a failed paint instead of reusing an unknown physical cursor with delivered=%s', delivered => {
    setCellDimensions({ widthPx: 9, heightPx: 18 });
    const terminal = new Screen(40, 20);
    const device = terminal.asDevice();
    const painter = new MainScreenPainter(device); painter.start();
    const rows = inlineImageRows(pngImage(320, 161), 'kitty', 16)!;
    const chrome = [`prompt>${CURSOR_MARKER}`, 'hint'];
    painter.paint([...rows, ...chrome], chrome);
    const changed = ['prompt>', `hint${CURSOR_MARKER}`];
    const failure = new Error('private unknown image frame');
    const write = device.write.bind(device);
    const spy = vi.spyOn(device, 'write').mockImplementationOnce((bytes, callback) => {
      if (delivered) write(bytes, callback);
      throw failure;
    });
    expect(() => painter.paint([...rows, ...changed], changed)).toThrow(failure);
    const physical = terminal.cursorScreenRow;
    expect(physical).toBe(delivered ? 6 : 5);
    const placements = terminal.graphics();
    spy.mockClear();
    for (let retry = 0; retry < 2; retry++) {
      expect(() => painter.paint([...rows, ...changed], changed)).toThrow(failure);
      expect(() => painter.leaveForExternalOutput()).toThrow(failure);
      expect(() => painter.resumeAfterExternalOutput()).toThrow(failure);
    }
    expect(spy).not.toHaveBeenCalled();
    expect(terminal.cursorScreenRow).toBe(physical);
    painter.stop();
    expect(terminal.graphics()).toEqual(placements);
    expect(terminal.cursorScreenRow).toBe(physical + 1);
    expect(spy).toHaveBeenCalledWith('\x1b[?7h\x1b[?2026l\r\n\x1b[?25h', undefined);
    spy.mockClear(); painter.stop(); painter.paint([...rows, ...chrome], chrome);
    expect(() => painter.start()).toThrow(failure);
    expect(spy).not.toHaveBeenCalled();
  });

  it.each(['start', 'handoff'] as const)('retires the painter after a failed %s write', action => {
    const terminal = new RecordingTerminal();
    const painter = new MainScreenPainter(terminal);
    if (action === 'handoff') { painter.start(); painter.paint(['retained', 'prompt>'], ['prompt>']); }
    const failure = new Error('private failed terminal ownership');
    const spy = vi.spyOn(terminal, 'write').mockImplementationOnce(() => { throw failure; });
    expect(() => action === 'start' ? painter.start() : painter.leaveForExternalOutput()).toThrow(failure);
    spy.mockClear();
    expect(() => painter.paint(['next', 'prompt>'], ['prompt>'])).toThrow(failure);
    expect(() => painter.resumeAfterExternalOutput()).toThrow(failure);
    expect(spy).not.toHaveBeenCalled();
    painter.stop();
    expect(() => painter.start()).toThrow(failure);
  });

  it.each(['hide', 'replace'] as const)('preserves the actual layer and stops after an unaccepted %s frame', action => {
    setCellDimensions({ widthPx: 9, heightPx: 18 });
    const terminal = new Screen(40, 20);
    const device = terminal.asDevice();
    const painter = new MainScreenPainter(device); painter.start();
    const first = inlineImageRows(pngImage(320, 161), 'kitty', 16)!;
    const next = action === 'hide' ? Array<string>(first.length).fill('')
      : inlineImageRows(pngImage(320, 161, 'after failed write'), 'kitty', 16)!;
    const chrome = [`prompt>${CURSOR_MARKER}`];
    painter.paint([...first, ...chrome], chrome);
    const placements = terminal.graphics();
    const failure = new Error('private unaccepted image frame');
    const spy = vi.spyOn(device, 'write').mockImplementationOnce(() => { throw failure; });
    expect(() => painter.paint([...next, ...chrome], chrome)).toThrow(failure);
    spy.mockClear();
    expect(() => painter.paint([...next, ...chrome], chrome)).toThrow(failure);
    expect(spy).not.toHaveBeenCalled();
    expect(terminal.graphics()).toEqual(placements);
    painter.stop();
    expect(terminal.graphics()).toEqual(placements);
  });

  it('cleans a replaced document picture without deleting a previously retained history picture', () => {
    setCellDimensions({ widthPx: 9, heightPx: 18 });
    const terminal = new Screen(40, 10);
    const painter = new MainScreenPainter(terminal.asDevice()); painter.start();
    const rows = inlineImageRows(pngImage(320, 161), 'kitty', 16)!;
    const chrome = ['prompt>'];
    const document = {};
    painter.paint([...rows, ...Array<string>(10).fill('history'), ...rows, ...chrome], chrome, undefined, document);
    const historical = terminal.graphics().filter(image => image.top < 0);
    expect(historical).toHaveLength(1);
    expect(terminal.graphics()).toHaveLength(2);
    painter.paint(['new conversation', ...chrome], chrome, undefined, {});
    expect(terminal.graphics()).toEqual(historical);
  });

  it('scrolls a crossing picture fully into history before replacing its document', () => {
    setCellDimensions({ widthPx: 9, heightPx: 18 });
    const terminal = new Screen(40, 6);
    const painter = new MainScreenPainter(terminal.asDevice()); painter.start();
    const rows = [...inlineImageRows(pngImage(320, 161), 'kitty', 16)!, 'following'];
    const chrome = ['prompt>'];
    painter.paint([...rows, ...chrome], chrome, undefined, {});
    const imageId = terminal.graphics()[0]!.imageId;
    expect(terminal.graphics()[0]).toMatchObject({ top: -1, rows: 5 });
    painter.paint(['new conversation', ...chrome], chrome, undefined, {});
    expect(terminal.graphics()).toHaveLength(1);
    expect(terminal.graphics()[0]).toMatchObject({ imageId, rows: 5 });
    expect(terminal.graphics()[0]!.top + 5).toBeLessThanOrEqual(0);
    expect(terminal.screenLines()).toContain('new conversation');
    expect(terminal.screenLines()).toContain('prompt>');
    expect(terminal.cursorScreenRow).toBe(1);
  });

  it.each([false, true])('preserves crossing historical pictures and retires failed document replacement with delivered=%s', delivered => {
    setCellDimensions({ widthPx: 9, heightPx: 18 });
    const terminal = new Screen(40, 6);
    const device = terminal.asDevice();
    const painter = new MainScreenPainter(device); painter.start();
    const rows = [...inlineImageRows(pngImage(320, 161), 'kitty', 16)!, 'following'];
    const chrome = [`prompt>${CURSOR_MARKER}`];
    painter.paint([...rows, ...chrome], chrome, undefined, {});
    const imageId = terminal.graphics()[0]!.imageId;
    const replacement = {};
    const failure = new Error('private failed document replacement');
    const write = device.write.bind(device);
    const spy = vi.spyOn(device, 'write').mockImplementationOnce((bytes, callback) => {
      if (delivered) write(bytes, callback);
      throw failure;
    });
    expect(() => painter.paint(['new conversation', ...chrome], chrome, undefined, replacement)).toThrow(failure);
    spy.mockClear();
    expect(() => painter.paint(['new conversation', ...chrome], chrome, undefined, replacement)).toThrow(failure);
    expect(spy).not.toHaveBeenCalled();
    expect(terminal.graphics()).toHaveLength(1);
    expect(terminal.graphics()[0]).toMatchObject({ imageId, rows: 5 });
    painter.stop();
    expect(terminal.graphics()).toHaveLength(1);
    expect(terminal.graphics()[0]!.imageId).toBe(imageId);
  });

  it("keeps the caret account through scrolling, appends, and external output", () => {
    const terminal = new Screen(40, 6);
    const painter = new MainScreenPainter(terminal.asDevice());
    painter.start();
    const rows = ['one', 'two', 'three', 'four', 'five', 'six'];
    const chrome = [`> he${CURSOR_MARKER}llo`, 'help'];
    for (let count = 1; count <= rows.length; count++) {
      painter.paint([...rows.slice(0, count), ...chrome], chrome);
      expect(terminal.cursorScreenRow).toBe(Math.min(count, 4));
      expect(terminal.cursorScreenColumn).toBe(4);
      expect(terminal.allLines().filter(line => line === '> hello')).toHaveLength(1);
      expect(terminal.allLines().join('')).not.toContain(CURSOR_MARKER);
    }
    painter.leaveForExternalOutput();
    terminal.write('external\r\n');
    painter.resumeAfterExternalOutput();
    const resumed = [`> hell${CURSOR_MARKER}o`, 'help'];
    painter.paint([...rows, ...resumed], resumed);
    expect(terminal.cursorScreenColumn).toBe(6);
    expect(terminal.allLines().filter(line => line === 'external')).toHaveLength(1);
    for (const row of rows) expect(terminal.allLines().filter(line => line === row)).toHaveLength(1);
    expect(terminal.allLines().filter(line => line === '> hello')).toHaveLength(1);
  });

  it("strips every marker and clamps a full-width caret after resize", () => {
    const writes: string[] = [];
    let width = 8;
    const painter = new MainScreenPainter({ write: data => writes.push(data),
      getDimensions: () => ({ columns: width, rows: 4 }), capabilities: { supportsDec2026Sync: false } });
    painter.start();
    painter.paint([`hidden${CURSOR_MARKER}`, 'two', 'three', 'four', `12345678${CURSOR_MARKER}`], [`12345678${CURSOR_MARKER}`]);
    expect(writes.join('')).not.toContain(CURSOR_MARKER);
    expect(writes.join('')).toContain('\x1b[7C\x1b[?25h');
    writes.length = 0; width = 4;
    painter.paint(['hidden', 'two', 'three', 'four', `1234${CURSOR_MARKER}`], [`1234${CURSOR_MARKER}`]);
    expect(writes.join('')).toContain('\x1b[3C\x1b[?25h');
    expect(writes.join('')).toContain('\x1b[?7l');
    writes.length = 0;
    painter.paint(['hidden', 'two', 'three', 'four', 'none'], ['none']);
    expect(writes.join('')).toContain('\x1b[?25l');
    expect(writes.join('')).not.toContain('\x1b[?25h');
  });

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

  it('shows a replacement conversation after the previous one exceeded the viewport', () => {
    const terminal = new Screen();
    const painter = new MainScreenPainter(terminal.asDevice());
    painter.start();
    const chrome = ['prompt>'];
    const earlier = Array.from({ length: 30 }, (_, index) => `old message ${index}`);
    painter.paint([...earlier, ...chrome], chrome, undefined, {});
    const scrollback = [...terminal.scrollback];
    const replacement = {};
    for (let render = 0; render < 3; render++) {
      painter.paint(['first question', 'Now at first.', ...chrome], chrome, undefined, replacement);
    }
    expect(terminal.countOnScreen('first question')).toBe(1);
    expect(terminal.countOnScreen('Now at first.')).toBe(1);
    expect(terminal.countOnScreen('old message 29')).toBe(0);
    expect(terminal.scrollback).toEqual(scrollback);
    expect(terminal.allLines().filter(line => line === 'first question')).toHaveLength(1);
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

  it("paints the block once on a session's first frame", () => {
    // A session starts with nothing said, so the frame is the block alone and
    // the document is exactly as long as the block. Reading that as "there was
    // no block to remove" left the block in the content as well, which put the
    // prompt in the scrollback and drew a second copy under it — permanently,
    // on the first frame of every session.
    const terminal = new Screen();
    const painter = new MainScreenPainter(terminal.asDevice());
    painter.start();

    painter.paint(["prompt>"], ["prompt>"]);

    expect(terminal.allLines().filter((line) => line === "prompt>")).toHaveLength(1);
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
