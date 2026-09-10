import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ComposedView } from "../../presentation/tui/adapter/view.js";
import { stripAnsi } from "../../presentation/tui/text/ansi.js";
import type { Block } from "../../presentation/tui/transcript/blocks.js";
import { createViewState, type InteractiveView, type ViewContext } from "../../presentation/tui/view.js";
import { InteractiveSurface } from "./frameSurface.js";
import { createView, readSurfaceChoice, ViewHost } from "./surface.js";

/**
 * Both surfaces are driven through the same script over the same state and
 * must answer with the same rows and the same geometry at every step. That is
 * the contract that makes the surface choice reversible: nothing the user did
 * on one could have come out differently on the other.
 */

interface Facts {
  activity: ViewContext["activity"] extends () => infer T ? T : never;
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

function contextFor(live: Facts): ViewContext {
  return {
    facts: () => ({ model: "parity-model", provider: "p", branch: "main" }),
    statusItems: () => ["model", "branch"],
    activity: () => live.activity,
    busy: () => live.busy,
    queuedCount: () => live.queued,
    now: () => live.now,
    ambient: () => ({ openTodos: 1, peerSessions: 0 }),
    newlineKey: () => "ctrl+j",
    cancelArmed: () => live.cancelArmed,
    overlayFullScreen: () => live.fullScreen,
    overlayRows: (_width, height) => (live.fullScreen ? Array.from({ length: height }, (_, i) => `modal ${i}`) : live.overlay),
    selection: () => live.selection,
    toast: () => live.toast,
  };
}

const SIZE = { columns: 60, rows: 16 };

function pair(): { frame: InteractiveSurface; composed: ComposedView; live: Facts; state: ReturnType<typeof createViewState> } {
  const live = facts();
  const state = createViewState();
  return {
    frame: new InteractiveSurface(contextFor(live), state),
    composed: new ComposedView(contextFor(live), state),
    live,
    state,
  };
}

function expectSameFrame(frame: InteractiveView, composed: InteractiveView): readonly string[] {
  const left = frame.renderFrame(SIZE).rows;
  const right = composed.renderFrame(SIZE).rows;
  expect(right).toEqual(left);
  expect(composed.scrolledBack).toBe(frame.scrolledBack);
  expect(composed.scrollbarGeometry()).toEqual(frame.scrollbarGeometry());
  return left;
}

describe("surface parity", () => {
  it("paints the first frame identically", () => {
    const { frame, composed, state } = pair();
    state.transcript.append({ kind: "notice", text: "welcome", finalized: true });
    state.editor.insert("draft");
    const rows = expectSameFrame(frame, composed).map(stripAnsi);
    expect(rows).toHaveLength(SIZE.rows);
    expect(rows.join("\n")).toContain("welcome");
    expect(rows.join("\n")).toContain("parity-model");
    expect(rows.join("\n")).toContain("╰─ draft");
  });

  it("stays identical through a streamed turn with activity, tool card, and queued input", () => {
    const { frame, composed, state, live } = pair();
    state.transcript.append({ kind: "user", text: "do the thing", finalized: true });
    live.busy = true;
    live.queued = 1;
    live.activity = { startedAt: 4_000, label: "working", tokens: 120, cancelling: false };
    const thinking: Block = state.transcript.append({ kind: "thinking", text: "", collapsed: true, finalized: false });
    const assistant: Block = state.transcript.append({ kind: "assistant", text: "", finalized: false });
    for (const piece of ["Plan", " it\n\n", "- step one\n", "- step two\n"]) {
      thinking.text += piece;
      assistant.text += piece;
      expectSameFrame(frame, composed);
    }
    const tool: Block = state.transcript.append({
      kind: "tool",
      title: "bash",
      detail: "ls",
      text: "",
      status: "running",
      finalized: false,
    });
    expectSameFrame(frame, composed);
    tool.text = "a.ts\nb.ts";
    tool.status = "failed";
    tool.finalized = true;
    live.activity = { startedAt: 4_000, label: "working", tokens: 300, cancelling: true };
    expectSameFrame(frame, composed);
    state.transcript.finalizeAll();
    live.busy = false;
    live.queued = 0;
    live.activity = undefined;
    const rows = expectSameFrame(frame, composed).map(stripAnsi).join("\n");
    expect(rows).toContain("step two");
    expect(rows).toContain("b.ts");
  });

  it("scrolls, pages, and drags the thumb to the same place", () => {
    const { frame, composed, state } = pair();
    for (let i = 0; i < 60; i++) state.transcript.append({ kind: "user", text: `line ${i}`, finalized: true });
    expectSameFrame(frame, composed);
    expect(frame.scroll(-5)).toBe(true);
    expect(composed.scroll(-5)).toBe(true);
    expectSameFrame(frame, composed);
    expect(frame.scrollPage(-1)).toBe(composed.scrollPage(-1));
    expectSameFrame(frame, composed);
    expect(frame.scrollToThumb(3, 1)).toBe(composed.scrollToThumb(3, 1));
    expectSameFrame(frame, composed);
    expect(frame.scroll(1_000)).toBe(composed.scroll(1_000));
    const rows = expectSameFrame(frame, composed).map(stripAnsi).join("\n");
    expect(rows).toContain("line 59");
    expect(frame.scroll(1)).toBe(false);
    expect(composed.scroll(1)).toBe(false);
  });

  it("keeps a scrolled-back window on its content rows while new output arrives", () => {
    const { frame, composed, state } = pair();
    for (let i = 0; i < 40; i++) state.transcript.append({ kind: "user", text: `line ${i}`, finalized: true });
    expectSameFrame(frame, composed);
    frame.scroll(-10);
    composed.scroll(-10);
    const before = expectSameFrame(frame, composed).map(stripAnsi);
    const firstVisible = before.find((row) => row.includes("line "));
    for (let i = 40; i < 50; i++) state.transcript.append({ kind: "user", text: `line ${i}`, finalized: true });
    const after = expectSameFrame(frame, composed).map(stripAnsi);
    // What the reader had at the top of the window is still at the top of the window.
    expect(after.find((row) => row.includes("line "))).toBe(firstVisible);
    expect(frame.scrolledBack).toBeGreaterThan(10);
  });

  it("shades a content-space selection and maps hits identically", () => {
    const { frame, composed, state, live } = pair();
    for (let i = 0; i < 30; i++) {
      state.transcript.append({ kind: "tool", title: `tool ${i}`, text: `output ${i}`, status: "ok", collapsed: true, finalized: true });
    }
    expectSameFrame(frame, composed);
    const anchor = frame.screenToContent(3, 2);
    expect(composed.screenToContent(3, 2)).toEqual(anchor);
    live.selection = { from: anchor, to: { row: anchor.row + 2, column: 6 } };
    const rows = expectSameFrame(frame, composed);
    expect(rows[3]).toContain("\x1b[7m");
    expect(composed.contentToScreenSpan(live.selection)).toEqual(frame.contentToScreenSpan(live.selection));
    expect(composed.contentRows()).toEqual(frame.contentRows());
    for (let row = 0; row < SIZE.rows; row++) {
      expect(composed.blockAtScreenRow(row)).toBe(frame.blockAtScreenRow(row));
    }
    frame.scroll(-6);
    composed.scroll(-6);
    expectSameFrame(frame, composed);
  });

  it("shows toast, cancel hint, completions, panel, and full-screen overlays the same way", () => {
    const { frame, composed, state, live } = pair();
    state.transcript.append({ kind: "assistant", text: "done", finalized: true });
    live.toast = "Copied 42 characters to clipboard";
    let rows = expectSameFrame(frame, composed).map(stripAnsi);
    expect(rows[rows.length - 1]).toContain("Copied 42 characters");
    live.toast = undefined;
    live.cancelArmed = true;
    rows = expectSameFrame(frame, composed).map(stripAnsi);
    expect(rows[rows.length - 1]).toContain("press ctrl+c again");
    live.cancelArmed = false;
    state.editor.insert("/mo");
    state.suggestions.setItems([{ value: "/mode", label: "/mode", detail: "switch" }]);
    frame.setSuggesting(true);
    composed.setSuggesting(true);
    rows = expectSameFrame(frame, composed).map(stripAnsi);
    expect(rows.join("\n")).toContain("tab complete");
    frame.setSuggesting(false);
    composed.setSuggesting(false);
    live.overlay = ["┌ Permission: write ┐", "│ allow once        │", "└───────────────────┘"];
    rows = expectSameFrame(frame, composed).map(stripAnsi);
    expect(rows.join("\n")).toContain("Permission: write");
    live.overlay = [];
    live.fullScreen = true;
    rows = expectSameFrame(frame, composed).map(stripAnsi);
    expect(rows[0]).toBe("modal 0");
    expect(rows.join("\n")).not.toContain("done");
    live.fullScreen = false;
    rows = expectSameFrame(frame, composed).map(stripAnsi);
    expect(rows.join("\n")).toContain("done");
  });
});

describe("view host", () => {
  it("builds the chosen surface over host-owned state", () => {
    const live = facts();
    const state = createViewState();
    const frame = new ViewHost({ choice: "frame", context: contextFor(live), state });
    const composed = new ViewHost({ choice: "composed", context: contextFor(live), state });
    expect(frame.current).toBeInstanceOf(InteractiveSurface);
    expect(composed.current).toBeInstanceOf(ComposedView);
    expect(frame.current.transcript).toBe(state.transcript);
    expect(composed.current.editor).toBe(state.editor);
    expect(composed.surface).toBe("composed");
  });

  it("falls back to the default surface over the same state when the chosen one fails to paint", () => {
    const live = facts();
    const state = createViewState();
    state.transcript.append({ kind: "user", text: "kept across the swap", finalized: true });
    state.editor.insert("kept draft");
    const onFallback = vi.fn();
    const host = new ViewHost({
      choice: "composed",
      context: contextFor(live),
      state,
      onFallback,
      factory: (choice, context, shared) => {
        if (choice === "frame") return createView(choice, context, shared);
        return {
          ...createView(choice, context, shared),
          renderFrame: () => {
            throw new Error("composed paint failed");
          },
        } as InteractiveView;
      },
    });
    const rows = host.renderFrame(SIZE).rows.map(stripAnsi).join("\n");
    expect(rows).toContain("kept across the swap");
    expect(rows).toContain("kept draft");
    expect(host.surface).toBe("frame");
    expect(host.current).toBeInstanceOf(InteractiveSurface);
    expect(host.current.transcript).toBe(state.transcript);
    expect(onFallback).toHaveBeenCalledOnce();
    expect(onFallback.mock.calls[0]![1]).toBe("composed");
    // The swap happened once; the default surface now answers directly.
    host.renderFrame(SIZE);
    expect(onFallback).toHaveBeenCalledOnce();
  });

  it("lets a failure in the default surface surface as an error", () => {
    const live = facts();
    const host = new ViewHost({
      choice: "frame",
      context: contextFor(live),
      factory: () =>
        ({
          ...createView("frame", contextFor(live), createViewState()),
          renderFrame: () => {
            throw new Error("default paint failed");
          },
        }) as InteractiveView,
    });
    expect(() => host.renderFrame(SIZE)).toThrow("default paint failed");
  });
});

describe("surface choice", () => {
  const dirs: string[] = [];
  const originalHome = process.env.HOME;
  afterEach(() => {
    process.env.HOME = originalHome;
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });

  function workspace(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "surface-choice-"));
    dirs.push(dir);
    return dir;
  }

  it("defaults to the frame surface", () => {
    process.env.HOME = workspace();
    expect(readSurfaceChoice(workspace(), {})).toBe("frame");
  });

  it("reads the project setting and lets the environment override it", () => {
    process.env.HOME = workspace();
    const root = workspace();
    fs.mkdirSync(path.join(root, ".agents"), { recursive: true });
    fs.writeFileSync(path.join(root, ".agents", "settings.json"), JSON.stringify({ tui: { surface: "composed" } }));
    expect(readSurfaceChoice(root, {})).toBe("composed");
    expect(readSurfaceChoice(root, { CODING_AGENTS_TUI_SURFACE: "frame" })).toBe("frame");
  });

  it("ignores values it does not recognise", () => {
    process.env.HOME = workspace();
    const root = workspace();
    fs.mkdirSync(path.join(root, ".agents"), { recursive: true });
    fs.writeFileSync(path.join(root, ".agents", "settings.json"), JSON.stringify({ tui: { surface: "hologram" } }));
    expect(readSurfaceChoice(root, { CODING_AGENTS_TUI_SURFACE: "nope" })).toBe("frame");
  });
});
