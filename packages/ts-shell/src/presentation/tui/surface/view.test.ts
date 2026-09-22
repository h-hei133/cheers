import { describe, expect, it } from "vitest";
import { stripAnsi } from "../text/ansi.js";
import type { Block } from "../transcript/blocks.js";
import { createViewState, type ViewContext } from "./contract.js";
import { InteractiveSurface } from "./view.js";

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
    newlineKey: () => "ctrl+j",
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

describe("frame composition", () => {
  it("composes the transcript, band, prompt, and hint row into one frame", () => {
    const { view } = surface({ ambient: () => ({ openTodos: 2, peerSessions: 0 }) });
    view.transcript.append({ kind: "user", text: "what is the plan?", finalized: true });
    view.editor.insert("follow-up");
    const rows = frame(view, { columns: 60, rows: 12 });
    expect(rows).toHaveLength(12);
    expect(rows.join("\n")).toContain("what is the plan?");
    expect(rows.join("\n")).toContain("the-model");
    expect(rows.join("\n")).toContain("╰─ follow-up");
    expect(rows[rows.length - 1]).toContain("2 open todos");
  });

  it("puts the completion list between the prompt and the hint row", () => {
    const { view } = surface();
    view.editor.insert("/mo");
    view.suggestions.setItems([{ value: "/mode", label: "/mode", detail: "switch mode" }]);
    view.setSuggesting(true);
    expect(view.suggestionsOpen).toBe(true);
    const rows = frame(view, { columns: 60, rows: 12 });
    const prompt = rows.findIndex((row) => row.includes("╰─ /mo"));
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
    const rows = view.renderFrame({ columns: 40, rows: 6 }).rows;
    expect(rows).toHaveLength(6);
    expect(rows.join("\n")).not.toContain("hidden while");
    expect(rows[0]).toBe("modal 0");
    live.fullScreen = false;
    expect(frame(view).join("\n")).toContain("hidden while");
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

  it("reports where the composer was drawn", () => {
    const { view } = surface();
    view.editor.insert("draft");
    const rows = frame(view);
    const geometry = view.composerGeometry();
    expect(geometry).toBeDefined();
    expect(rows[geometry!.top]).toContain("╰─ draft");
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
    const composerRow = rows.find((row) => row.includes("╰─"));
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
