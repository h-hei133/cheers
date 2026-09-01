import { describe, expect, it } from "vitest";
import { InteractiveSurface, type SurfaceContext } from "./frameSurface.js";
import { textBlock } from "../../presentation/tui/transcript/blocks.js";
import { visibleWidth } from "../../presentation/tui/text/measure.js";
import { CURSOR_MARKER } from "../../presentation/tui/render/paint.js";

function surface(overrides: Partial<SurfaceContext> = {}): InteractiveSurface {
  return new InteractiveSurface({
    band: () => ({ model: "opus-5", branch: "main", directory: "~/p" }),
    activity: () => undefined,
    busy: () => false,
    queuedCount: () => 0,
    now: () => 1_000,
    ...overrides,
  });
}

const SIZE = { columns: 60, rows: 20 };

describe("frame composition", () => {
  it("puts the chrome last so it owns the bottom of the screen", () => {
    const view = surface();
    view.transcript.append(textBlock("notice", "history"));
    const plan = view.renderFrame(SIZE);
    const cue = plan.viewport.findIndex((row) => row.includes("╰─"));
    expect(cue).toBeGreaterThan(plan.viewport.findIndex((row) => row.includes("history")));
    expect(cue).toBeGreaterThanOrEqual(plan.viewport.length - 3);
  });

  it("never composes more rows than the screen has", () => {
    const view = surface();
    for (let index = 0; index < 200; index++) {
      view.transcript.append(textBlock("notice", `row ${index}`));
    }
    expect(view.renderFrame(SIZE).viewport.length).toBeLessThanOrEqual(SIZE.rows);
  });

  it("keeps the frame bounded even on a very short screen", () => {
    const view = surface();
    for (let index = 0; index < 20; index++) view.transcript.append(textBlock("notice", `r${index}`));
    const plan = view.renderFrame({ columns: 40, rows: 6 });
    expect(plan.viewport.every((row) => visibleWidth(row) <= 40)).toBe(true);
  });

  it("carries exactly one cursor marker", () => {
    const view = surface();
    const markers = view.renderFrame(SIZE).viewport.join("").split(CURSOR_MARKER).length - 1;
    expect(markers).toBe(1);
  });
});

describe("retirement handshake", () => {
  it("offers history in the same frame the transcript overflows", () => {
    const view = surface();
    for (let index = 0; index < 40; index++) {
      view.transcript.append(textBlock("notice", `row ${index}`));
    }
    const plan = view.renderFrame(SIZE);
    expect(plan.history).toBeDefined();
    expect(plan.history!.rows.join("\n")).toContain("row 0");
  });

  it("does not paint an offered batch inside the viewport as well", () => {
    // The same rows reaching scrollback and the mutable viewport in one frame is
    // exactly how a transcript ends up duplicated on screen.
    const view = surface();
    for (let index = 0; index < 40; index++) {
      view.transcript.append(textBlock("notice", `row ${index}`));
    }
    const plan = view.renderFrame(SIZE);
    const retired = plan.history!.rows.join("\n");
    const shown = plan.viewport.join("\n");
    expect(retired).toContain("row 0");
    expect(shown).not.toContain("row 0");
  });

  it("stops offering the batch once it is acknowledged", () => {
    const view = surface();
    for (let index = 0; index < 40; index++) {
      view.transcript.append(textBlock("notice", `row ${index}`));
    }
    const first = view.renderFrame(SIZE).history!;
    view.acknowledgeHistory(first.id);
    const next = view.renderFrame(SIZE).history;
    expect(next?.id).not.toBe(first.id);
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
    const rows = view.renderFrame(SIZE).viewport.join("\n");
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
    expect(idle.renderFrame(SIZE).viewport.join("")).not.toContain("esc to interrupt");

    const busy = surface({
      busy: () => true,
      activity: () => ({ startedAt: 0, label: "read", tokens: 1200, cancelling: false, estimated: true }),
      now: () => 3_400,
    });
    const rows = busy.renderFrame(SIZE).viewport.join("\n");
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
    expect(view.renderFrame(SIZE).viewport.join("\n")).toContain("interrupting");
  });
});
