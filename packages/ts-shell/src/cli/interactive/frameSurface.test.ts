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

describe("InteractiveSurface right-edge scrollbar", () => {
  it("does not draw scrollbar when transcript fits within capacity", () => {
    const surface = new InteractiveSurface(createContext());
    surface.transcript.append({ kind: "user", text: "short prompt", finalized: true });

    const plan = surface.renderFrame({ columns: 60, rows: 20 });
    const content = plan.rows.join("\n");
    expect(content).not.toContain("█");
  });

  it("draws scrollbar track and thumb when transcript overflows capacity", () => {
    const surface = new InteractiveSurface(createContext());
    for (let i = 0; i < 40; i++) {
      surface.transcript.append({ kind: "user", text: `line ${i}`, finalized: true });
    }

    const plan = surface.renderFrame({ columns: 60, rows: 15 });
    const content = plan.rows.join("\n");
    expect(content).toContain("│");
    expect(content).toContain("█");
    expect(surface.canScroll).toBe(true);
  });

  it("updates thumb position proportionally with scrollToRatio", () => {
    const surface = new InteractiveSurface(createContext());
    for (let i = 0; i < 50; i++) {
      surface.transcript.append({ kind: "user", text: `line ${i}`, finalized: true });
    }

    surface.renderFrame({ columns: 60, rows: 15 });
    expect(surface.scrolledBack).toBe(0);

    // Scroll to top (ratio = 0)
    surface.scrollToRatio(0);
    expect(surface.scrolledBack).toBeGreaterThan(0);

    // Scroll to bottom (ratio = 1)
    surface.scrollToRatio(1);
    expect(surface.scrolledBack).toBe(0);
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
