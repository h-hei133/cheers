import { describe, expect, it, vi } from "vitest";
import { Pointer } from "./pointer.js";
import { parseMouseReport } from "../../presentation/tui/input/mouse.js";
import type { InteractiveSurface } from "./frameSurface.js";

function build(overrides: Partial<InteractiveSurface> = {}) {
  const copied: string[] = [];
  let redrawn = 0;
  const rows = [
    "  line 1 of transcript                                                          ",
    "  line 2 of transcript                                                          ",
    "  line 3 of transcript                                                          ",
    "  line 4 of transcript                                                          ",
  ];

  const surface = {
    scroll: vi.fn(),
    screenToContent: vi.fn((row: number, column: number) => ({ row, column })),
    blockAtScreenRow: vi.fn(),
    transcript: {
      setCollapsed: vi.fn(),
    },
    ...overrides,
  } as unknown as InteractiveSurface;
  const pointer = new Pointer({
    surface,
    rows: () => rows,
    copy: (text) => copied.push(text),
    redraw: () => (redrawn += 1),
  });

  return { pointer, surface, copied, redraws: () => redrawn, rows };
}

describe("pointer drag selection", () => {
  it("drags across lines and copies on release", () => {
    const { pointer, copied, redraws } = build();

    // Press at line 0, col 2
    pointer.handle(parseMouseReport("\x1b[<0;3;1M")!);
    expect(pointer.selection).toBeDefined();

    // Drag to line 1, col 20
    pointer.handle(parseMouseReport("\x1b[<32;21;2M")!);
    expect(pointer.selection).toBeDefined();

    // Release
    pointer.handle(parseMouseReport("\x1b[<0;21;2m")!);
    expect(copied.length).toBe(1);
    expect(copied[0]).toContain("line 1");
    expect(redraws()).toBeGreaterThanOrEqual(3);
  });

  it("clears selection on single click without drag", () => {
    const { pointer, copied, redraws } = build();

    // First make a selection
    pointer.handle(parseMouseReport("\x1b[<0;3;1M")!);
    pointer.handle(parseMouseReport("\x1b[<32;21;2M")!);
    pointer.handle(parseMouseReport("\x1b[<0;21;2m")!);
    expect(pointer.selection).toBeDefined();

    // Single click (press + release at same position)
    pointer.handle(parseMouseReport("\x1b[<0;10;3M")!);
    pointer.handle(parseMouseReport("\x1b[<0;10;3m")!);
    expect(pointer.selection).toBeUndefined();
    expect(redraws()).toBeGreaterThanOrEqual(5);
  });
});
describe("pointer wheel scrolling", () => {
  it("scrolls surface on mouse wheel up and down", () => {
    const { pointer, surface, redraws } = build();

    // Wheel up (button = 64 / delta = -1)
    pointer.handle(parseMouseReport("\x1b[<64;10;2M")!);
    expect(surface.scroll).toHaveBeenCalledWith(-3);
    expect(redraws()).toBe(1);

    // Wheel down (button = 65 / delta = 1)
    pointer.handle(parseMouseReport("\x1b[<65;10;2M")!);
    expect(surface.scroll).toHaveBeenCalledWith(3);
    expect(redraws()).toBe(2);
  });
});

describe("pointer selection lifecycle", () => {
  it("allows clearing and copying selection programmatically", () => {
    const { pointer, copied } = build();

    // Drag from col 0 to col 10 on row 0
    pointer.handle(parseMouseReport("\x1b[<0;1;1M")!);
    pointer.handle(parseMouseReport("\x1b[<32;11;1M")!);
    expect(pointer.selection).toBeDefined();

    const didCopy = pointer.copySelection();
    expect(didCopy).toBe(true);
    expect(copied.length).toBe(1);
    expect(pointer.selection).toBeUndefined();

    // clearSelection returns false when no selection is active
    expect(pointer.clearSelection()).toBe(false);
  });
});
