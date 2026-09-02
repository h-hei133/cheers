import { describe, expect, it } from "vitest";
import { InteractiveSurface, type SurfaceContext } from "./frameSurface.js";
import { textBlock } from "../../presentation/tui/transcript/blocks.js";
import { visibleWidth } from "../../presentation/tui/text/measure.js";
import { CURSOR_MARKER } from "../../presentation/tui/render/paint.js";

function surface(overrides: Partial<SurfaceContext> = {}): InteractiveSurface {
  return new InteractiveSurface({
    facts: () => ({ model: "opus-5", provider: "openai", branch: "main", directory: "~/p" }),
    statusItems: () => ["model", "branch"] as const,
    activity: () => undefined,
    busy: () => false,
    queuedCount: () => 0,
    now: () => 1_000,
    ambient: () => ({ openTodos: 0, peerSessions: 0 }),
    newlineKey: () => "shift+enter",
    cancelArmed: () => false,
    overlayFullScreen: () => false,
    overlayRows: () => [],
    selection: () => undefined,
    ...overrides,
  });
}

const SIZE = { columns: 60, rows: 20 };

describe("frame composition", () => {
  it("puts the chrome last so it owns the bottom of the screen", () => {
    const view = surface();
    view.transcript.append(textBlock("notice", "history"));
    const plan = view.renderFrame(SIZE);
    const cue = plan.rows.findIndex((row) => row.includes("╰─"));
    expect(cue).toBeGreaterThan(plan.rows.findIndex((row) => row.includes("history")));
    expect(cue).toBeGreaterThanOrEqual(plan.rows.length - 3);
  });

  it("never composes more rows than the screen has", () => {
    const view = surface();
    for (let index = 0; index < 200; index++) {
      view.transcript.append(textBlock("notice", `row ${index}`));
    }
    expect(view.renderFrame(SIZE).rows.length).toBeLessThanOrEqual(SIZE.rows);
  });

  it("keeps the frame bounded even on a very short screen", () => {
    const view = surface();
    for (let index = 0; index < 20; index++) view.transcript.append(textBlock("notice", `r${index}`));
    const plan = view.renderFrame({ columns: 40, rows: 6 });
    expect(plan.rows.every((row) => visibleWidth(row) <= 40)).toBe(true);
  });

  it("carries exactly one cursor marker", () => {
    const view = surface();
    const markers = view.renderFrame(SIZE).rows.join("").split(CURSOR_MARKER).length - 1;
    expect(markers).toBe(1);
  });
});

describe("scrolling the conversation", () => {
  function tall(): InteractiveSurface {
    const view = surface();
    for (let index = 0; index < 40; index++) {
      view.transcript.append(textBlock("notice", `row ${index}`));
    }
    return view;
  }

  it("shows the newest rows by default, because a conversation is read at its end", () => {
    const plan = tall().renderFrame(SIZE);

    expect(plan.rows.join("\n")).toContain("row 39");
    expect(plan.rows.join("\n")).not.toContain("row 0");
  });

  it("scrolls back to earlier rows and returns", () => {
    const view = tall();
    view.renderFrame(SIZE);

    expect(view.scrollPage(-1)).toBe(true);
    expect(view.renderFrame(SIZE).rows.join("\n")).not.toContain("row 39");

    view.scrollToEnd();
    expect(view.renderFrame(SIZE).rows.join("\n")).toContain("row 39");
  });

  it("cannot scroll past the start or past the end", () => {
    const view = tall();
    view.renderFrame(SIZE);
    for (let press = 0; press < 50; press++) view.scrollPage(-1);
    expect(view.renderFrame(SIZE).rows.join("\n")).toContain("row 0");

    for (let press = 0; press < 50; press++) view.scrollPage(1);
    expect(view.scrolledBack).toBe(0);
  });

  it("reports whether a scroll moved, so a key can fall through", () => {
    const view = surface();
    view.transcript.append(textBlock("notice", "only row"));
    view.renderFrame(SIZE);

    // Nothing above the window to reveal, so the key did not scroll.
    expect(view.scroll(-1)).toBe(false);
    expect(view.scrolledBack).toBe(0);
  });

  it("keeps the chrome at the bottom however far back the window is", () => {
    const view = tall();
    view.renderFrame(SIZE);
    view.scrollPage(-1);
    const plan = view.renderFrame(SIZE);

    expect(plan.rows.at(-1)).toBeDefined();
    const cue = plan.rows.findIndex((row) => row.includes("╰─"));
    expect(cue).toBeGreaterThanOrEqual(plan.rows.length - 3);
  });

  it("finds the block under a screen row, for a click", () => {
    const view = surface();
    view.transcript.append(textBlock("notice", "clickable"));
    const plan = view.renderFrame(SIZE);
    // Screen rows are counted from the top of the transcript window, which begins
    // after the filler that keeps the chrome at the bottom.
    const screenRow = plan.rows.findIndex((candidate) => candidate.includes("clickable"));
    const filler = plan.rows.findIndex((candidate) => candidate.length > 0);

    expect(view.blockAtScreenRow(screenRow - filler)?.text).toBe("clickable");
  });
});

describe("completion list", () => {
  it("stays closed until it holds candidates", () => {
    const view = surface();
    view.setSuggesting(true);
    expect(view.suggestionsOpen).toBe(false);
    view.suggestions.setItems([{ value: "/help", label: "/help" }]);
    view.setSuggesting(true);
    expect(view.suggestionsOpen).toBe(true);
  });

  it("appears inside the chrome and replaces the hint row", () => {
    const view = surface();
    view.suggestions.setItems([{ value: "/help", label: "/help", detail: "show commands" }]);
    view.setSuggesting(true);
    const rows = view.renderFrame(SIZE).rows.join("\n");
    expect(rows).toContain("/help");
    expect(rows).toContain("tab complete");
  });

  it("clears its candidates when closed", () => {
    const view = surface();
    view.suggestions.setItems([{ value: "/help", label: "/help" }]);
    view.setSuggesting(true);
    view.setSuggesting(false);
    expect(view.suggestions.length).toBe(0);
  });
});

describe("live activity", () => {
  it("adds the activity row only while a turn is running", () => {
    const idle = surface();
    expect(idle.renderFrame(SIZE).rows.join("")).not.toContain("esc to interrupt");

    const busy = surface({
      busy: () => true,
      activity: () => ({ startedAt: 0, label: "read", tokens: 1200, cancelling: false, estimated: true }),
      now: () => 3_400,
    });
    const rows = busy.renderFrame(SIZE).rows.join("\n");
    expect(rows).toContain("read");
    expect(rows).toContain("3.4s");
    expect(rows).toContain("~1.2k tok");
  });

  it("says it is interrupting instead of implying progress", () => {
    const view = surface({
      busy: () => true,
      activity: () => ({ startedAt: 0, label: "read", tokens: 0, cancelling: true }),
      now: () => 1_000,
    });
    expect(view.renderFrame(SIZE).rows.join("\n")).toContain("interrupting");
  });
});
