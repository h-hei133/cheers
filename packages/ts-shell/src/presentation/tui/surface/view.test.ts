import { Pager } from '../chrome/pager.js';
import { createReport, reportText, span } from '../../../core/commands/report/projection.js';
import { describe, expect, it, vi } from "vitest";
import { stripAnsi } from "../text/ansi.js";
import { visibleWidth } from "../text/measure.js";
import { CURSOR_MARKER } from "../render/paint.js";
import type { Block } from "../transcript/blocks.js";
import { createViewState, type ViewContext } from "./contract.js";
import { InteractiveSurface } from "./view.js";
import { TUI } from "../render/engine.js";
import { ManualScheduler, RecordingTerminal } from "../../../test-utils/terminalDouble.js";
import { COMPOSER_SHAPES } from "../composer/shapes.js";
import type { ComposerShapeId } from "../composer/contract.js";
import { Pointer } from "../../../cli/interactive/pointer.js";
import { OverlayHost } from "../../../cli/interactive/overlay.js";
import { parseKeyEvent } from '../input/keys.js';

/** Facts a test can change between frames; the surface reads them at paint time. */
interface Facts {
  activity: ReturnType<ViewContext["activity"]>;
  busy: boolean;
  queued: number;
  cancelArmed: boolean;
  toast: string | undefined;
  overlay: string[];
  fullScreen: boolean;
  selection: ReturnType<ViewContext["selection"]>;
  now: number;
}

function facts(): Facts {
  return {
    activity: undefined,
    busy: false,
    queued: 0,
    cancelArmed: false,
    toast: undefined,
    overlay: [],
    fullScreen: false,
    selection: undefined,
    now: 5_000,
  };
}

function contextFor(live: Facts, overrides: Partial<ViewContext> = {}): ViewContext {
  return {
    facts: () => ({ model: "the-model", provider: "p", branch: "main" }),
    statusItems: () => ["model", "branch"],
    activity: () => live.activity,
    busy: () => live.busy,
    queuedCount: () => live.queued,
    now: () => live.now,
    ambient: () => ({ openTodos: 0, peerSessions: 0 }),
    cancelArmed: () => live.cancelArmed,
    overlayFullScreen: () => live.fullScreen,
    overlayRows: (_width, height) =>
      live.fullScreen ? Array.from({ length: height }, (_, i) => `modal ${i}`) : live.overlay,
    selection: () => live.selection,
    toast: () => live.toast,
    ...overrides,
  };
}

function surface(overrides: Partial<ViewContext> = {}): { view: InteractiveSurface; live: Facts } {
  const live = facts();
  return { view: new InteractiveSurface(contextFor(live, overrides)), live };
}

const SIZE = { columns: 60, rows: 16 };

function frame(view: InteractiveSurface, size = SIZE): string[] {
  return view.renderFrame(size).rows.map(stripAnsi);
}

describe("the document a main-screen frame reports", () => {
  it("retains written history through one-row and unavailable terminal sizes", () => {
    const { view } = surface();
    for (let index = 0; index < 20; index++) view.transcript.append({ kind: "notice", text: `history-${index}`, finalized: true });
    const terminal = new RecordingTerminal();
    const scheduler = new ManualScheduler();
    const tui = new TUI(terminal, scheduler); tui.setFrameProvider(view);
    tui.start({ useAlternateScreen: false }); scheduler.flush(); terminal.drain();
    terminal.rows = 1; terminal.resize(); scheduler.flush(); terminal.drain();
    terminal.rows = 10; terminal.resize(); scheduler.flush();
    expect(terminal.drain()).not.toMatch(/history-\d/);
    terminal.rows = 0; terminal.columns = 0; terminal.resize(); scheduler.flush();
    expect(terminal.drain()).toBe("");
    terminal.rows = 10; terminal.columns = 40; terminal.resize(); scheduler.flush();
    expect(terminal.drain()).not.toMatch(/history-\d/);
    expect(view.composerGeometry()).toBeUndefined();
    tui.stop();
  });

  it("ends with the fixed block, the same way the composed rows do", () => {
    // The main screen splits the block off the document's tail by count. A
    // document that omitted it told the painter the block was content, so the
    // last rows of the transcript were never painted — no error, just a screen
    // that stopped short.
    const { view } = surface();
    view.transcript.append({ kind: "user", text: "hello", finalized: true });
    const plan = view.renderFrame(SIZE, "document");
    const document = plan.rows.map(stripAnsi);
    const chrome = (plan.chromeRows ?? []).map(stripAnsi);

    expect(chrome.length).toBeGreaterThan(0);
    expect(document.slice(document.length - chrome.length)).toEqual(chrome);
  });

  it("carries every content row the viewport would have dropped", () => {
    const { view } = surface();
    for (let index = 0; index < 60; index++) {
      view.transcript.append({ kind: "user", text: `line ${index}`, finalized: true });
    }
    const plan = view.renderFrame({ columns: 60, rows: 10 }, "document");
    const document = plan.rows.map(stripAnsi);

    expect(document.join("\n")).toContain("line 0");
    expect(document.join("\n")).toContain("line 59");
    expect(document.length).toBeGreaterThan(10);
    expect(view.scrollbarGeometry()).toBeUndefined();
    expect(document.join("\n")).not.toContain("█");
  });

  it("decorates a single document layout at the requested width", () => {
    const highlight = vi.fn((row: string, index: number) => `${row}\x1b[4m${index}\x1b[24m`);
    const { view, live } = surface({ highlightSearchMatches: highlight, imageProtocol: () => "kitty" });
    view.transcript.append({ kind: "user", text: "hello", finalized: true });
    view.transcript.append({ kind: "user", text: "picture", finalized: true, images: [{ type: "image", mimeType: "image/png", data: "QUJD" }] });
    live.selection = { from: { row: 0, column: 0 }, to: { row: 0, column: 10 } };
    const render = vi.spyOn(view.transcript, "render");
    const plan = view.renderFrame({ columns: 30, rows: 5 }, "document");
    const content = plan.rows.slice(0, -plan.chromeRows!.length);

    expect(render).toHaveBeenCalledOnce();
    expect(render).toHaveBeenCalledWith(30, { imageProtocol: "kitty" });
    expect(content[0]).toContain("\x1b[7m");
    expect(content[0]).toContain("\x1b[4m0\x1b[24m");
    expect(content.join("\n")).toContain("QUJD");
    expect(highlight).toHaveBeenCalledTimes(content.length);
    expect(view.scrollbarGeometry()).toBeUndefined();
  });

  it("uses the same decorated content for a document and an unscrolled viewport", () => {
    const { view, live } = surface({ highlightSearchMatches: (row, index) => `${row}\x1b[4m${index}\x1b[24m` });
    view.transcript.append({ kind: "user", text: "hello", finalized: true });
    live.selection = { from: { row: 0, column: 0 }, to: { row: 0, column: 10 } };
    const document = view.renderFrame(SIZE, "document");
    const viewport = view.renderFrame(SIZE, "viewport");

    expect(viewport.rows.slice(-document.rows.length)).toEqual(document.rows);
  });
});

describe("frame composition", () => {
  it.each([false, true])('fits input forms to the chrome budget and retains the form caret when resizing (crowded: %s)', async crowded => {
    const overlay = new OverlayHost(() => {});
    overlay.open({ title: 'Edit list', form: 'panel', empty: '', load: async () => [], apply: async () => undefined,
      input: { initial: 'first\nsecond\nlast!', label: 'List', multiline: true, validate: () => undefined, apply: async () => undefined } });
    await Promise.resolve(); await Promise.resolve();
    let available = 0;
    const { view, live } = surface({ overlayInputActive: () => overlay.inputActive,
      hintStatus: () => crowded ? { completion: 'Loading suggestions' } : undefined,
      overlayRows: (width, height, budget = 0) => {
      available = budget; const rendered = overlay.render(width, height, budget);
      expect(rendered.length).toBeLessThanOrEqual(budget);
      return rendered;
    } });
    view.editor.setText('held draft\nnext line');
    if (crowded) {
      live.activity = { startedAt: 0, label: 'working', tokens: 0, cancelling: false };
      view.suggestions.setItems(Array.from({ length: 12 }, (_, index) => ({ label: `item-${index}`, value: `${index}` })));
      view.setSuggesting(true);
    }
    for (const columns of [8, 40, 8]) {
      for (const rows of [1, 2, 3, 4, 8, 12, 24]) {
        const plan = view.renderFrame({ columns, rows });
        expect(plan.rows.length).toBeLessThanOrEqual(rows);
        expect(available).toBeGreaterThan(0);
        expect(plan.rows.some(row => row.includes(`last!${CURSOR_MARKER}`))).toBe(true);
        expect(view.editor.snapshot().text).toBe('held draft\nnext line');
        if (rows <= 2) expect(view.composerGeometry()).toBeUndefined();
      }
    }
    overlay.handleKey(parseKeyEvent('\x1b[A'), vi.fn());
    const moved = view.renderFrame({ columns: 40, rows: 8 });
    expect(moved.rows.some(row => row.includes(`secon${CURSOR_MARKER}d`))).toBe(true);
    overlay.close();
    expect(view.renderFrame(SIZE).rows.join('\n')).toContain(`next line${CURSOR_MARKER}`);
    expect(view.composerGeometry()).toBeDefined();
  });

  it('allocates a real panel from the remaining viewport alongside a long draft', async () => {
    const overlay = new OverlayHost(() => {});
    overlay.open({ title: 'Models', form: 'panel', empty: 'none', apply: async () => undefined,
      load: async () => Array.from({ length: 51 }, (_, index) => ({ id: String(index), label: `Candidate ${index}` })),
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    const { view } = surface({ overlayRows: (width, height, available) => overlay.render(width, height, available) });
    view.editor.setText(Array.from({ length: 40 }, (_, index) => `draft ${index}`).join('\n'));
    let largestCount = 0;
    for (const columns of [20, 40, 80, 120, 200]) {
      for (const rows of [8, 24, 40, 80]) {
        const rendered = frame(view, { columns, rows });
        expect(rendered.length).toBeLessThanOrEqual(rows);
        for (const line of rendered) expect(visibleWidth(line)).toBeLessThanOrEqual(columns);
        largestCount = Math.max(largestCount, rendered.filter(line => /Candidate \d+/.test(line)).length);
      }
    }
    expect(largestCount).toBe(51);
    expect(view.editor.snapshot().text).toContain('draft 39');
    overlay.close();
  });

  it("rejects old shape hit regions before an accepted configuration change is painted", () => {
    let shape: ComposerShapeId = "default";
    const { view } = surface({ composerShape: () => shape });
    view.editor.setText("  draft unchanged  "); frame(view);
    expect(view.composerGeometry()!.layout.shape).toBe("default");
    shape = "box";
    expect(view.composerGeometry()).toBeUndefined();
    frame(view);
    expect(view.composerGeometry()!.layout.shape).toBe("box");
    expect(view.editor.snapshot().text).toBe("  draft unchanged  ");
  });

  it("cancels drag geometry immediately on resize before the scheduled frame", () => {
    const { view } = surface(); view.editor.setText("  draft with source  ");
    const terminal = new RecordingTerminal(); const scheduler = new ManualScheduler();
    const tui = new TUI(terminal, scheduler); tui.setFrameProvider(view);
    tui.start(); scheduler.flush();
    const copy = vi.fn();
    const pointer = new Pointer({ view: () => view, rows: () => view.contentRows(), copy, redraw: () => tui.requestRender() });
    const geometry = view.composerGeometry()!;
    const row = geometry.top + geometry.layout.rows.find(row => row.kind === "content")!.screenRow;
    const event = { row, button: 0, shift: false, alt: false, ctrl: false };
    pointer.handle({ ...event, column: 5, kind: "press" });
    pointer.handle({ ...event, column: 12, kind: "drag" });
    expect(pointer.composerSelection).toBeDefined();
    terminal.columns = 20; terminal.resize();
    expect(view.composerGeometry()).toBeUndefined();
    pointer.handle({ ...event, column: 12, kind: "release" });
    expect(copy).not.toHaveBeenCalled();
    scheduler.flush(); expect(view.composerGeometry()!.layout.width).toBe(20);
    tui.stop();
  });

  it.each(Object.keys(COMPOSER_SHAPES) as ComposerShapeId[])("keeps %s draft and caret within small physical dimensions alongside suggestions and status", shape => {
    const { view, live } = surface({ composerShape: () => shape });
    live.activity = { startedAt: 0, label: "working", tokens: 0, cancelling: false };
    live.busy = true;
    live.overlay = ["panel header", "panel item", "panel end"];
    view.editor.setText("中\t👩‍💻long\n  draft  \nlast");
    view.suggestions.setItems(Array.from({ length: 12 }, (_, index) => ({ label: `item-${index}`, value: `${index}` })));
    view.setSuggesting(true);
    for (const columns of [80, 40, 20, 8, 4, 2, 1]) {
      for (const rows of [8, 4, 2, 1]) {
        const plan = view.renderFrame({ columns, rows });
        expect(plan.rows).toHaveLength(rows);
        expect(plan.rows.every(row => visibleWidth(row) <= columns)).toBe(true);
        const geometry = view.composerGeometry()!;
        expect(geometry.top).toBeGreaterThanOrEqual(0);
        expect(geometry.bottom).toBeLessThan(rows);
        const caretRow = plan.rows.find(row => row.includes(CURSOR_MARKER));
        expect(caretRow).toBeDefined();
        expect(visibleWidth(caretRow!.split(CURSOR_MARKER)[0]!)).toBeLessThan(columns);
      }
    }
    expect(view.renderFrame({ columns: 0, rows: 4 }).rows).toEqual([]);
    expect(view.composerGeometry()).toBeUndefined();
  });

  it("invalidates source hit testing before a changed draft or fullscreen overlay is redrawn", () => {
    const { view, live } = surface();
    view.editor.setText("before"); frame(view);
    expect(view.composerGeometry()).toBeDefined();
    view.editor.insert("!");
    expect(view.composerGeometry()).toBeUndefined();
    frame(view); expect(view.composerGeometry()).toBeDefined();
    live.fullScreen = true;
    expect(view.composerGeometry()).toBeUndefined();
    frame(view); live.fullScreen = false;
    expect(view.composerGeometry()).toBeUndefined();
    frame(view); expect(view.composerGeometry()!.layout.source).toBe("before!");
  });

  it("composes the transcript, band, prompt, and hint row into one frame", () => {
    const { view } = surface({ ambient: () => ({ openTodos: 2, peerSessions: 0 }) });
    view.transcript.append({ kind: "user", text: "what is the plan?", finalized: true });
    view.editor.insert("follow-up");
    const rows = frame(view, { columns: 60, rows: 12 });
    expect(rows).toHaveLength(12);
    expect(rows.join("\n")).toContain("what is the plan?");
    expect(rows.join("\n")).toContain("the-model");
    expect(rows.join("\n")).toContain(" follow-up");
    expect(rows[rows.length - 1]).toContain("2 open todos");
  });

  it("puts the completion list between the prompt and the hint row", () => {
    const { view } = surface();
    view.editor.insert("/mo");
    view.suggestions.setItems([{ value: "/mode", label: "/mode", detail: "switch mode" }]);
    view.setSuggesting(true);
    expect(view.suggestionsOpen).toBe(true);
    const rows = frame(view, { columns: 60, rows: 12 });
    const prompt = rows.findIndex((row) => row.includes(" /mo"));
    const candidate = rows.findIndex((row) => row.includes("/mode"));
    const hint = rows.findIndex((row) => row.includes("tab complete"));
    expect(prompt).toBeGreaterThan(-1);
    expect(candidate).toBeGreaterThan(prompt);
    expect(hint).toBeGreaterThan(candidate);
    view.setSuggesting(false);
    expect(view.suggestionsOpen).toBe(false);
    expect(view.suggestions.length).toBe(0);
  });

  it("places an inline panel between the activity row and the band", () => {
    const { view, live } = surface();
    live.activity = { startedAt: 0, label: "reading", tokens: 0, cancelling: false };
    live.busy = true;
    live.overlay = ["┌ panel ┐", "└───────┘"];
    const rows = frame(view, { columns: 60, rows: 14 });
    const activity = rows.findIndex((row) => row.includes("reading"));
    const panel = rows.findIndex((row) => row.includes("panel"));
    const band = rows.findIndex((row) => row.includes("the-model"));
    expect(activity).toBeGreaterThan(-1);
    expect(panel).toBeGreaterThan(activity);
    expect(band).toBeGreaterThan(panel);
  });

  it("hands the whole screen to a full-screen overlay and gives it back", () => {
    const { view, live } = surface();
    view.transcript.append({ kind: "assistant", text: "hidden while the reader is up", finalized: true });
    live.fullScreen = true;
    const overlay = view.renderFrame({ columns: 40, rows: 6 }, "document");
    expect(overlay.fullScreen).toBe(true);
    const rows = overlay.rows;
    expect(rows).toHaveLength(6);
    expect(rows.join("\n")).not.toContain("hidden while");
    expect(rows[0]).toBe("modal 0");
    live.fullScreen = false;
    expect(frame(view).join("\n")).toContain("hidden while");
  });

  it('projects hover reporting intent after overlay composition and clears it when the picker closes', () => {
    let motion = false;
    const { view, live } = surface({ overlayPointerMotion: () => motion });
    motion = true; live.fullScreen = true;
    expect(view.renderFrame(SIZE).pointerMotion).toBe(true);
    live.fullScreen = false; expect(view.renderFrame(SIZE).pointerMotion).toBe(true);
    motion = false; expect(view.renderFrame(SIZE).pointerMotion).toBe(false);
    expect(view.renderFrame({ columns: 0, rows: 0 }).pointerMotion).toBeUndefined();
  });

  it("shows the toast, then the exit hint, in place of the hint row", () => {
    const { view, live } = surface();
    live.toast = "Copied 42 characters to clipboard";
    let rows = frame(view);
    expect(rows[rows.length - 1]).toContain("Copied 42 characters");
    live.toast = undefined;
    live.cancelArmed = true;
    rows = frame(view);
    expect(rows[rows.length - 1]).toContain("press ctrl+c again");
  });

  it('keeps incomplete completion status visible beside selectable candidates at narrow and short sizes', () => {
    const { view, live } = surface({ hintStatus: () => ({ completion: 'Results incomplete: unreadable sources' }) });
    view.editor.setText('/resume Rec');
    view.suggestions.setItems(Array.from({ length: 20 }, (_, index) => ({ label: `Recent ${index}`, value: `session-${index}` })));
    view.setSuggesting(true);
    for (const rows of [18, 6]) {
      const rendered = frame(view, { columns: 40, rows });
      expect(rendered.some(row => row.includes('Recent'))).toBe(true);
      expect(rendered.some(row => row.includes('Results incomplete'))).toBe(true);
      expect(rendered).toHaveLength(rows);
    }
    live.cancelArmed = true;
    expect(frame(view).join('\n')).toContain('press ctrl+c again');
  });

  it("reports where the composer was drawn", () => {
    const { view } = surface();
    view.editor.insert("draft");
    const rows = frame(view);
    const geometry = view.composerGeometry();
    expect(geometry).toBeDefined();
    const content = geometry!.layout.rows.find(row => row.kind === "content")!;
    expect(rows[geometry!.top + content.screenRow]).toContain(" draft");
    expect(geometry!.bottom).toBeGreaterThanOrEqual(geometry!.top);
    expect(geometry!.rows.map(stripAnsi).join("\n")).toContain("draft");
  });
});

describe("a streamed turn", () => {
  it("keeps the frame whole while activity, thinking, answer, and a tool card stream in", () => {
    const { view, live } = surface();
    view.transcript.append({ kind: "user", text: "do the thing", finalized: true });
    live.busy = true;
    live.queued = 1;
    live.activity = { startedAt: 4_000, label: "working", tokens: 120, cancelling: false };
    const thinking: Block = view.transcript.append({ kind: "thinking", text: "", collapsed: true, finalized: false });
    const assistant: Block = view.transcript.append({ kind: "assistant", text: "", finalized: false });
    for (const piece of ["Plan", " it\n\n", "- step one\n", "- step two\n"]) {
      thinking.text += piece;
      assistant.text += piece;
      const rows = frame(view);
      expect(rows).toHaveLength(SIZE.rows);
      expect(rows.join("\n")).toContain("working");
    }
    const tool: Block = view.transcript.append({
      kind: "tool",
      title: "bash",
      detail: "ls",
      text: "",
      status: "running",
      finalized: false,
    });
    expect(frame(view).join("\n")).toContain("bash");
    tool.text = "a.ts\nb.ts";
    tool.status = "failed";
    tool.finalized = true;
    live.activity = { startedAt: 4_000, label: "working", tokens: 300, cancelling: true };
    expect(frame(view)).toHaveLength(SIZE.rows);
    view.transcript.finalizeAll();
    live.busy = false;
    live.queued = 0;
    live.activity = undefined;
    const rows = frame(view).join("\n");
    expect(rows).toContain("step two");
    // A failed tool shows its output: that output is the reason it failed.
    expect(rows).toContain("b.ts");
    expect(rows).not.toContain("working");
  });
});

describe("scrolling", () => {
  function longConversation(lines: number): InteractiveSurface {
    const { view } = surface();
    for (let i = 0; i < lines; i++) view.transcript.append({ kind: "user", text: `line ${i}`, finalized: true });
    return view;
  }

  it("draws no scrollbar while the transcript fits", () => {
    const { view } = surface();
    view.transcript.append({ kind: "user", text: "short message", finalized: true });
    const content = view.renderFrame({ columns: 60, rows: 15 }).rows.join("\n");
    expect(content).not.toContain("█");
    expect(content).not.toContain("│");
    expect(view.scrollbarGeometry()).toBeUndefined();
  });

  it("draws a track and thumb in the last column once the transcript overflows", () => {
    const view = longConversation(40);
    const content = view.renderFrame({ columns: 60, rows: 15 }).rows.join("\n");
    expect(content).toContain("█");
    expect(content).toContain("│");
    const geometry = view.scrollbarGeometry();
    expect(geometry).toBeDefined();
    expect(geometry!.column).toBe(59);
    expect(geometry!.thumbHeight).toBeGreaterThanOrEqual(1);
    expect(geometry!.maxScrollTop).toBeGreaterThan(0);
  });

  it("follows the newest rows until told otherwise, and says when a move had nowhere to go", () => {
    const view = longConversation(60);
    let rows = frame(view);
    expect(rows.join("\n")).toContain("line 59");
    expect(view.scrolledBack).toBe(0);
    expect(view.scroll(-5)).toBe(true);
    frame(view);
    expect(view.scrolledBack).toBe(5);
    expect(view.scrollPage(-1)).toBe(true);
    frame(view);
    expect(view.scrolledBack).toBeGreaterThan(5);
    expect(view.scroll(1_000)).toBe(true);
    rows = frame(view);
    expect(rows.join("\n")).toContain("line 59");
    expect(view.scrolledBack).toBe(0);
    expect(view.scroll(1)).toBe(false);
  });

  it("keeps the same content line at the top when the width changes", () => {
    const view = longConversation(60);
    view.renderFrame({ columns: 60, rows: 15 });
    view.scroll(-5);
    const wide = view.renderFrame({ columns: 60, rows: 15 }).rows;
    const wideTop = /line (\d+)/.exec(wide.join("\n"))![1];
    const narrow = view.renderFrame({ columns: 40, rows: 15 }).rows;
    expect(/line (\d+)/.exec(narrow.join("\n"))![1]).toBe(wideTop);
    expect(view.scrolledBack).toBeGreaterThan(0);
  });

  it("moves the window under the thumb", () => {
    const view = longConversation(40);
    view.renderFrame({ columns: 60, rows: 15 });
    expect(view.scrolledBack).toBe(0);
    expect(view.scrollToThumb(0)).toBe(true);
    view.renderFrame({ columns: 60, rows: 15 });
    expect(view.scrolledBack).toBeGreaterThan(0);
    expect(view.scrollToThumb(0)).toBe(false);
    view.scrollToEnd();
    view.renderFrame({ columns: 60, rows: 15 });
    expect(view.scrolledBack).toBe(0);
  });

  it("keeps a scrolled-back window on its content rows while new output arrives", () => {
    const view = longConversation(40);
    frame(view);
    view.scroll(-10);
    const before = frame(view);
    const firstVisible = before.find((row) => row.includes("line "));
    for (let i = 40; i < 50; i++) view.transcript.append({ kind: "user", text: `line ${i}`, finalized: true });
    const after = frame(view);
    // What the reader had at the top of the window is still at the top of the window.
    expect(after.find((row) => row.includes("line "))).toBe(firstVisible);
    expect(view.scrolledBack).toBeGreaterThan(10);
  });

  it('starts a replacement conversation at its end with a distinct document identity', () => {
    const view = longConversation(40);
    const before = view.renderFrame({ columns: 60, rows: 15 });
    view.scroll(-10);
    view.transcript.append({ kind: 'assistant', text: 'ordinary append', finalized: true });
    expect(view.renderFrame({ columns: 60, rows: 15 }).documentId).toBe(before.documentId);
    view.transcript.clear();
    for (let index = 0; index < 40; index++) view.transcript.append({ kind: 'user', text: `new branch ${index}`, finalized: true });
    const after = view.renderFrame({ columns: 60, rows: 15 });
    expect(after.documentId).not.toBe(before.documentId);
    expect(after.rows.join('\n')).toContain('new branch 39');
    expect(view.scrolledBack).toBe(0);
  });
});

describe("selection", () => {
  it("clamps a hit past the end of a line onto the line", () => {
    const { view } = surface();
    view.transcript.append({ kind: "user", text: "hello", finalized: true });
    view.renderFrame({ columns: 60, rows: 15 });
    const point = view.screenToContent(13, 50);
    expect(point.row).toBeGreaterThanOrEqual(0);
    expect(point.column).toBeLessThan(50);
  });

  it("shades a content-space selection on the transcript rows only and names the block under a row", () => {
    const { view, live } = surface();
    for (let i = 0; i < 30; i++) {
      view.transcript.append({ kind: "tool", title: `tool ${i}`, text: `output ${i}`, status: "ok", collapsed: true, finalized: true });
    }
    view.renderFrame(SIZE);
    const anchor = view.screenToContent(3, 2);
    live.selection = { from: anchor, to: { row: anchor.row + 2, column: 6 } };
    const rows = view.renderFrame(SIZE).rows;
    expect(rows[3]).toContain("\x1b[7m");
    const geometry = view.composerGeometry()!;
    const content = geometry.layout.rows.find(row => row.kind === 'content')!;
    const composerRow = rows[geometry.top + content.screenRow];
    expect(composerRow).toBeDefined();
    expect(composerRow).not.toContain("\x1b[7m");
    expect(view.contentToScreenSpan(live.selection)?.from.row).toBe(3);
    expect(view.contentRows().length).toBeGreaterThan(SIZE.rows);
    const block = view.blockAtScreenRow(3);
    expect(block?.kind).toBe("tool");
    expect(view.blockAtScreenRow(SIZE.rows - 1)).toBeUndefined();
  });

  it("moves a content-space selection with the window, and hides it once it is off screen", () => {
    const { view } = surface();
    for (let i = 0; i < 30; i++) view.transcript.append({ kind: "user", text: `line ${i}`, finalized: true });
    view.renderFrame({ columns: 60, rows: 15 });
    const anchor = view.screenToContent(2, 0);
    const span = { from: { row: anchor.row, column: 0 }, to: { row: anchor.row + 1, column: 10 } };
    const initial = view.contentToScreenSpan(span);
    expect(initial).toBeDefined();
    expect(view.scroll(-2)).toBe(true);
    view.renderFrame({ columns: 60, rows: 15 });
    const scrolled = view.contentToScreenSpan(span);
    expect(scrolled!.from.row).toBe(initial!.from.row + 2);
    view.scrollToEnd();
    for (let i = 30; i < 50; i++) view.transcript.append({ kind: "user", text: `line ${i}`, finalized: true });
    view.renderFrame({ columns: 60, rows: 15 });
    expect(view.contentToScreenSpan({ from: { row: 0, column: 0 }, to: { row: 2, column: 10 } })).toBeUndefined();
  });
});

describe("collapsing from the keyboard", () => {
  function withBlocks(): { view: InteractiveSurface; live: Facts } {
    const made = surface();
    made.view.transcript.append({ kind: "thinking", text: "reasoning", finalized: true, collapsed: true });
    made.view.transcript.append({ kind: "tool", text: "output", finalized: true, collapsed: true });
    made.view.transcript.append({ kind: "assistant", text: "answer", finalized: true });
    return made;
  }

  it("expands the reasoning blocks without touching the tool output", () => {
    // The two are read at different times, so one key that toggled both would
    // make each press undo the other's state.
    const { view } = withBlocks();

    expect(view.toggleCollapsed("thinking")).toBe(true);

    const kinds = view.transcript.all().map((block) => [block.kind, block.collapsed]);
    expect(kinds).toEqual([
      ["thinking", false],
      ["tool", true],
      ["assistant", undefined],
    ]);
  });

  it("takes the second press back to where the first one started", () => {
    const { view } = withBlocks();
    view.toggleCollapsed("tool");
    view.toggleCollapsed("tool");

    expect(view.transcript.all().find((block) => block.kind === "tool")?.collapsed).toBe(true);
  });

  it("reports that there was nothing to toggle", () => {
    // So the key does not claim to have done something when the transcript holds
    // nothing collapsible.
    const { view } = surface();
    expect(view.toggleCollapsed("tool")).toBe(false);
  });

  it("leaves a block alone when it is already in the target state", () => {
    // One decision for the whole set, taken from the first: a mixed set must not
    // end up split the other way after two presses.
    const { view } = surface();
    view.transcript.append({ kind: "tool", text: "a", finalized: true, collapsed: true });
    view.transcript.append({ kind: "tool", text: "b", finalized: true, collapsed: false });

    view.toggleCollapsed("tool");
    expect(view.transcript.all().map((block) => block.collapsed)).toEqual([false, false]);

    view.toggleCollapsed("tool");
    expect(view.transcript.all().map((block) => block.collapsed)).toEqual([true, true]);
  });
});


it('fits report panels around the real composer and switches screens on resize', () => {
  const report = createReport({ title: 'Measured report', facts: {}, lines: Array.from({ length: 6 }, (_, i) =>
    ({ kind: 'text' as const, spans: [span(`value-${i} with complete provenance`)] })) });
  const pager = new Pager(); pager.open('/context', reportText(report), report);
  const { view } = surface({ overlayFullScreen: () => pager.fullScreen,
    overlayRows: (width, height, available) => pager.render(width, height, available), composerShape: () => 'box' });
  view.editor.setText('retained draft');
  const inline = view.renderFrame({ columns: 80, rows: 30 });
  expect(inline.fullScreen).not.toBe(true);
  expect(stripAnsi(inline.rows.join('\n'))).toContain('value-5');
  expect(stripAnsi(inline.rows.join('\n'))).toContain('retained draft');
  const full = view.renderFrame({ columns: 24, rows: 10 });
  expect(full.fullScreen).toBe(true); expect(full.rows).toHaveLength(10);
  expect(view.composerGeometry()).toBeUndefined();
  const restored = view.renderFrame({ columns: 80, rows: 30 });
  expect(restored.fullScreen).not.toBe(true);
  expect(stripAnsi(restored.rows.join('\n'))).toContain('retained draft');
  pager.close();
  const closed = view.renderFrame({ columns: 80, rows: 30 });
  expect(stripAnsi(closed.rows.join('\n'))).not.toContain('Measured report');
  expect(view.editor.getText()).toBe('retained draft');
});
