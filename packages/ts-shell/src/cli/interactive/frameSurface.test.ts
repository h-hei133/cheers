import { describe, expect, it } from "vitest";
import { InteractiveSurface, type SurfaceContext } from "./frameSurface.js";
import { stripAnsi } from "../../presentation/tui/text/ansi.js";

function createContext(overrides: Partial<SurfaceContext> = {}): SurfaceContext {
  return {
    facts: () => ({ model: "m", provider: "p" }),
    statusItems: () => ["model"],
    activity: () => undefined,
    busy: () => false,
    queuedCount: () => 0,
    now: () => 0,
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

describe("InteractiveSurface scrollbar and full-width rendering", () => {
  it("renders transcript without scrollbar when content fits capacity", () => {
    const surface = new InteractiveSurface(createContext());
    surface.transcript.append({ kind: "user", text: "short message", finalized: true });

    const plan = surface.renderFrame({ columns: 60, rows: 15 });
    const content = plan.rows.join("\n");
    expect(content).not.toContain("█");
    expect(content).not.toContain("│");
    expect(surface.scrollbarGeometry()).toBeUndefined();
  });

  it("renders right-edge scrollbar with track and thumb when content overflows", () => {
    const surface = new InteractiveSurface(createContext());
    for (let i = 0; i < 40; i++) {
      surface.transcript.append({ kind: "user", text: `line ${i}`, finalized: true });
    }

    const plan = surface.renderFrame({ columns: 60, rows: 15 });
    const content = plan.rows.join("\n");
    expect(content).toContain("█");
    expect(content).toContain("│");

    const geo = surface.scrollbarGeometry();
    expect(geo).toBeDefined();
    expect(geo!.column).toBe(59);
    expect(geo!.thumbHeight).toBeGreaterThanOrEqual(1);
    expect(geo!.maxScrollTop).toBeGreaterThan(0);
  });

  it("scrolls to thumb position on scrollToThumb", () => {
    const surface = new InteractiveSurface(createContext());
    for (let i = 0; i < 40; i++) {
      surface.transcript.append({ kind: "user", text: `line ${i}`, finalized: true });
    }
    surface.renderFrame({ columns: 60, rows: 15 });
    const initialBack = surface.scrolledBack;
    expect(initialBack).toBe(0); // initially following newest

    // Scroll to top of thumb track
    surface.scrollToThumb(0);
    expect(surface.scrolledBack).toBeGreaterThan(0);
  });

  it("clamps screenToContent column to the actual visible line width", () => {
    const surface = new InteractiveSurface(createContext());
    surface.transcript.append({ kind: "user", text: "hello", finalized: true });
    surface.renderFrame({ columns: 60, rows: 15 });

    // Clicking in the blank area far past "hello" (e.g. column 50)
    const coord = surface.screenToContent(13, 50);
    expect(coord.row).toBeGreaterThanOrEqual(0);
    // Clamped to the line length rather than floating in unselectable void
    expect(coord.column).toBeLessThan(50);
  });

  it("projects content-space selection to screen-space and tracks scrolling", () => {
    const surface = new InteractiveSurface(createContext());
    for (let i = 0; i < 30; i++) {
      surface.transcript.append({ kind: "user", text: `line ${i}`, finalized: true });
    }
    surface.renderFrame({ columns: 60, rows: 15 });

    // Pick content row that is currently on screen at row 2
    const contentCoord = surface.screenToContent(2, 0);
    const contentSpan = {
      from: { row: contentCoord.row, column: 0 },
      to: { row: contentCoord.row + 1, column: 10 },
    };
    const initialScreen = surface.contentToScreenSpan(contentSpan);
    expect(initialScreen).toBeDefined();

    // Scroll back into history by 2 lines (negative scrolls back)
    expect(surface.scroll(-2)).toBe(true);
    surface.renderFrame({ columns: 60, rows: 15 });
    const scrolledScreen = surface.contentToScreenSpan(contentSpan);
    expect(scrolledScreen).toBeDefined();
    // Screen row moved down by 2 as the view scrolled back
    expect(scrolledScreen!.from.row).toBe(initialScreen!.from.row + 2);
  });
  it("returns undefined when content selection is completely off-screen", () => {
    const surface = new InteractiveSurface(createContext());
    for (let i = 0; i < 50; i++) {
      surface.transcript.append({ kind: "user", text: `line ${i}`, finalized: true });
    }
    surface.renderFrame({ columns: 60, rows: 15 });

    // Selection at rows 0-2 (top of history, currently at bottom)
    const contentSpan = { from: { row: 0, column: 0 }, to: { row: 2, column: 10 } };
    expect(surface.contentToScreenSpan(contentSpan)).toBeUndefined();
  });
});

describe("InteractiveSurface selection shading isolation", () => {
  it("shades only transcript rows and never chrome", () => {
    const span = { from: { row: 0, column: 0 }, to: { row: 14, column: 50 } };
    const surface = new InteractiveSurface(createContext({ selection: () => span }));
    surface.transcript.append({ kind: "user", text: "hello world", finalized: true });

    const plan = surface.renderFrame({ columns: 60, rows: 15 });
    // Composer and cues are in chrome rows (bottom of frame)
    const composerRow = plan.rows.find((r) => r.includes("╰─"));
    expect(composerRow).toBeDefined();
    // Chrome composer row must not contain selection reverse-video escape sequences
    expect(composerRow).not.toContain("\x1b[7m");
  });
});

describe("InteractiveSurface toast in hints", () => {
  it("passes toast message through to hint row", () => {
    const surface = new InteractiveSurface(
      createContext({ toast: () => "Copied 120 characters to clipboard" }),
    );
    const plan = surface.renderFrame({ columns: 60, rows: 15 });
    const text = stripAnsi(plan.rows.join("\n"));
    expect(text).toContain("Copied 120 characters to clipboard");
  });
});
