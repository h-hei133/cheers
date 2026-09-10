import { describe, expect, it } from "vitest";
import { stripAnsi } from "../text/ansi.js";
import { createViewState, type ViewContext } from "../view.js";
import { ComposedView } from "./view.js";

function context(overrides: Partial<ViewContext> = {}): ViewContext {
  return {
    facts: () => ({ model: "composed-model", provider: "p" }),
    statusItems: () => ["model"],
    activity: () => undefined,
    busy: () => false,
    queuedCount: () => 0,
    now: () => 1_000,
    ambient: () => ({ openTodos: 0, peerSessions: 0 }),
    newlineKey: () => "ctrl+j",
    cancelArmed: () => false,
    overlayFullScreen: () => false,
    overlayRows: () => [],
    selection: () => undefined,
    toast: () => undefined,
    ...overrides,
  };
}

describe("composed view", () => {
  it("composes the transcript, band, prompt, and hint row into one frame", () => {
    const state = createViewState();
    state.transcript.append({ kind: "user", text: "what is the plan?", finalized: true });
    state.editor.insert("follow-up");
    const view = new ComposedView(context({ ambient: () => ({ openTodos: 2, peerSessions: 0 }) }), state);
    const rows = view.renderFrame({ columns: 60, rows: 12 }).rows.map(stripAnsi);
    expect(rows).toHaveLength(12);
    expect(rows.join("\n")).toContain("what is the plan?");
    expect(rows.join("\n")).toContain("composed-model");
    expect(rows.join("\n")).toContain("╰─ follow-up");
    expect(rows[rows.length - 1]).toContain("2 open todos");
  });

  it("puts the completion list between the prompt and the hint row", () => {
    const state = createViewState();
    state.editor.insert("/mo");
    state.suggestions.setItems([{ value: "/mode", label: "/mode", detail: "switch mode" }]);
    const view = new ComposedView(context(), state);
    view.setSuggesting(true);
    expect(view.suggestionsOpen).toBe(true);
    const rows = view.renderFrame({ columns: 60, rows: 12 }).rows.map(stripAnsi);
    const prompt = rows.findIndex((row) => row.includes("╰─ /mo"));
    const candidate = rows.findIndex((row) => row.includes("/mode"));
    const hint = rows.findIndex((row) => row.includes("tab complete"));
    expect(prompt).toBeGreaterThan(-1);
    expect(candidate).toBeGreaterThan(prompt);
    expect(hint).toBeGreaterThan(candidate);
    view.setSuggesting(false);
    expect(view.suggestionsOpen).toBe(false);
    expect(state.suggestions.length).toBe(0);
  });

  it("places an inline panel between the activity row and the band", () => {
    const state = createViewState();
    const view = new ComposedView(
      context({
        activity: () => ({ startedAt: 0, label: "reading", tokens: 0, cancelling: false }),
        busy: () => true,
        overlayRows: () => ["┌ panel ┐", "└───────┘"],
      }),
      state,
    );
    const rows = view.renderFrame({ columns: 60, rows: 14 }).rows.map(stripAnsi);
    const activity = rows.findIndex((row) => row.includes("reading"));
    const panel = rows.findIndex((row) => row.includes("panel"));
    const band = rows.findIndex((row) => row.includes("composed-model"));
    expect(activity).toBeGreaterThan(-1);
    expect(panel).toBeGreaterThan(activity);
    expect(band).toBeGreaterThan(panel);
  });

  it("hands the whole screen to a full-screen overlay", () => {
    const state = createViewState();
    state.transcript.append({ kind: "user", text: "hidden while the reader is up", finalized: true });
    const view = new ComposedView(
      context({ overlayFullScreen: () => true, overlayRows: (_w, h) => Array.from({ length: h }, (_, i) => `modal ${i}`) }),
      state,
    );
    const rows = view.renderFrame({ columns: 40, rows: 6 }).rows;
    expect(rows).toHaveLength(6);
    expect(rows.join("\n")).not.toContain("hidden while");
    expect(rows[0]).toBe("modal 0");
  });

  it("shows the toast in place of the hint row and the scrollbar when content overflows", () => {
    const state = createViewState();
    for (let i = 0; i < 40; i++) state.transcript.append({ kind: "user", text: `line ${i}`, finalized: true });
    const view = new ComposedView(context({ toast: () => "Copied 12 characters" }), state);
    const rows = view.renderFrame({ columns: 60, rows: 15 }).rows.map(stripAnsi);
    expect(rows[rows.length - 1]).toContain("Copied 12 characters");
    expect(rows.join("\n")).toContain("█");
    expect(view.scrollbarGeometry()?.column).toBe(59);
    expect(view.scrolledBack).toBe(0);
    expect(view.scroll(-3)).toBe(true);
    view.renderFrame({ columns: 60, rows: 15 });
    expect(view.scrolledBack).toBe(3);
    expect(view.scrollToThumb(0)).toBe(true);
    view.renderFrame({ columns: 60, rows: 15 });
    expect(view.scrolledBack).toBeGreaterThan(3);
    view.scrollToEnd();
    view.renderFrame({ columns: 60, rows: 15 });
    expect(view.scrolledBack).toBe(0);
  });
});
