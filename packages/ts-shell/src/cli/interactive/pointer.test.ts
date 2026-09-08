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
    scrollToRatio: vi.fn(),
    canScroll: true,
    transcriptCapacity: 4,
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

describe("pointer scrollbar interaction", () => {
  it("clicks on the rightmost scrollbar column and jumps to ratio", () => {
    const { pointer, surface, redraws, rows } = build();
    const width = rows[0]!.length; // 80

    // Press on row 2, column 79 (last column of 80)
    pointer.handle(parseMouseReport(`\x1b[<0;${width};3M`)!); // column is 1-indexed in SGR: width
    expect(surface.scrollToRatio).toHaveBeenCalledOnce();
    expect(redraws()).toBe(1);
    expect(pointer.selection).toBeUndefined(); // Did not start text drag
  });

  it("drags along the rightmost scrollbar column and continuously scrolls", () => {
    const { pointer, surface, redraws, rows } = build();
    const width = rows[0]!.length;

    // Press on scrollbar
    pointer.handle(parseMouseReport(`\x1b[<0;${width};1M`)!);
    expect(surface.scrollToRatio).toHaveBeenCalledTimes(1);

    // Drag along scrollbar to row 3
    pointer.handle(parseMouseReport(`\x1b[<32;${width};3M`)!);
    expect(surface.scrollToRatio).toHaveBeenCalledTimes(2);
    expect(redraws()).toBe(2);
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
