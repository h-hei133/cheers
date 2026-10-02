import { describe, expect, it, vi } from "vitest";
import { Pointer } from "./pointer.js";
import { parseMouseReport } from "../../presentation/tui/input/mouse.js";
import type { InteractiveView } from "../../presentation/tui/surface/contract.js";
import { SuggestionList } from "../../presentation/tui/chrome/suggestions.js";

function build(overrides: Partial<InteractiveView> = {}) {
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
    scrollbarGeometry: vi.fn(() => undefined),
    scrollToThumb: vi.fn(),
    screenToContent: vi.fn((row: number, column: number) => ({ row, column })),
    blockAtScreenRow: vi.fn(),
    transcript: {
      setCollapsed: vi.fn(),
    },
    ...overrides,
  } as unknown as InteractiveView;
  const pointer = new Pointer({
    view: () => surface,
    rows: () => rows,
    copy: (text) => copied.push(text),
    redraw: () => (redrawn += 1),
  });

  return { pointer, surface, copied, redraws: () => redrawn, rows };
}

describe("pointer drag selection", () => {
  it("selects a completion row and consumes the rest of its gesture", () => {
    const suggestions = new SuggestionList();
    suggestions.setItems(Array.from({ length: 12 }, (_, index) => ({ label: `item-${index}`, value: `${index}` })));
    for (let index = 0; index < 10; index++) suggestions.step(1);
    suggestions.render(60);
    const { pointer, surface, copied } = build({ suggestions, suggestionsOpen: true,
      choiceRegions: { suggestions: { top: 5, height: 9, width: 60 } } });
    pointer.handle(parseMouseReport("\x1b[<0;5;7M")!);
    expect(suggestions.current()?.value).toBe("4");
    expect(suggestions.chosen).toBe(true);
    pointer.handle(parseMouseReport("\x1b[<32;5;1M")!);
    pointer.handle(parseMouseReport("\x1b[<0;5;1m")!);
    expect(pointer.selection).toBeUndefined();
    expect(surface.scroll).not.toHaveBeenCalled();
    expect(surface.blockAtScreenRow).not.toHaveBeenCalled();
    expect(copied).toEqual([]);
  });

  it("lets overlays capture wheel and click events before transcript actions", () => {
    const { surface } = build();
    let active = true;
    const pointer = new Pointer({ view: () => surface, rows: () => [], copy: vi.fn(), redraw: vi.fn(), capture: () => active });
    pointer.handle(parseMouseReport("\x1b[<64;5;2M")!);
    pointer.handle(parseMouseReport("\x1b[<0;5;2M")!);
    active = false;
    pointer.handle(parseMouseReport("\x1b[<0;5;2m")!);
    expect(surface.scroll).not.toHaveBeenCalled();
    expect(surface.blockAtScreenRow).not.toHaveBeenCalled();
    expect(pointer.selection).toBeUndefined();
  });

  it.each(["completion", "overlay"])("keeps a drag entering %s captured until release outside", (kind) => {
    const suggestions = new SuggestionList();
    suggestions.setItems([{ value: "item", label: "item" }]);
    suggestions.render(60);
    const { surface } = build({ suggestions, suggestionsOpen: true,
      choiceRegions: { suggestions: { top: 5, height: 1, width: 60 } } });
    let overlay = false;
    const copy = vi.fn();
    const pointer = new Pointer({ view: () => surface, rows: () => ["transcript"], copy, redraw: vi.fn(), capture: () => overlay });
    pointer.handle(parseMouseReport("\x1b[<0;3;1M")!);
    overlay = kind === "overlay";
    pointer.handle(parseMouseReport("\x1b[<32;3;6M")!);
    overlay = false;
    pointer.handle(parseMouseReport("\x1b[<32;3;1M")!);
    pointer.handle(parseMouseReport("\x1b[<0;3;1m")!);
    expect(surface.blockAtScreenRow).not.toHaveBeenCalled();
    expect(copy).not.toHaveBeenCalled();
  });

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

  it("scrolls view automatically when dragging near the top or bottom edges", () => {
    const { pointer, surface } = build({
      composerGeometry: () => ({ top: 15, bottom: 16, rows: [] }),
    });
    pointer.handle(parseMouseReport("\x1b[<0;11;6M")!);
    expect(pointer.selection).toBeDefined();

    // Drag to top edge (row 0, 1-based is 1)
    pointer.handle(parseMouseReport("\x1b[<32;11;1M")!);
    expect(surface.scroll).toHaveBeenCalledWith(-1);

    // Drag to bottom edge (row 20, 1-based is 21)
    pointer.handle(parseMouseReport("\x1b[<32;11;21M")!);
    expect(surface.scroll).toHaveBeenCalledWith(1);

    // Release terminates drag and stops auto-scroll
    pointer.handle(parseMouseReport("\x1b[<0;11;21m")!);
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

describe("pointer scrollbar interaction", () => {
  it("jumps and drags scroll position when clicking/dragging on scrollbar column", () => {
    const scrollToThumb = vi.fn();
    const geo = {
      column: 79,
      trackTop: 0,
      trackHeight: 10,
      thumbTop: 5,
      thumbHeight: 2,
      maxScrollTop: 20,
    };
    const { pointer, redraws } = build({
      scrollbarGeometry: () => geo,
      scrollToThumb,
    });

    // Press on track above thumb (row 2, column 79)
    pointer.handle(parseMouseReport("\x1b[<0;80;3M")!);
    expect(scrollToThumb).toHaveBeenCalledWith(2, 1);
    expect(pointer.selection).toBeUndefined();

    // Drag to row 8
    pointer.handle(parseMouseReport("\x1b[<32;80;9M")!);
    expect(scrollToThumb).toHaveBeenCalledWith(8, 1);

    // Release terminates scrollbar drag
    pointer.handle(parseMouseReport("\x1b[<0;80;9m")!);
    expect(redraws()).toBeGreaterThanOrEqual(3);
  });
});

describe("pointer composer drag selection", () => {
  it("drags across composer rows and copies draft text on release", () => {
    const compRows = [
      "╰─ line 1 of input draft",
      "line 2 of input draft",
    ];
    const { pointer, copied, redraws } = build({
      composerGeometry: () => ({ top: 10, bottom: 11, rows: compRows }),
    });

    // Press at row 10 (screen row 10, 1-based is 11), col 0 (1-based is 1)
    pointer.handle(parseMouseReport("\x1b[<0;1;11M")!);
    expect(pointer.composerSelection).toBeDefined();
    expect(pointer.selection).toBeUndefined();

    // Drag to col 20 (1-based is 21)
    pointer.handle(parseMouseReport("\x1b[<32;21;11M")!);
    expect(pointer.composerSelection).toBeDefined();

    // Release
    pointer.handle(parseMouseReport("\x1b[<0;21;11m")!);
    expect(copied.length).toBe(1);
    expect(copied[0]).toContain("line 1");
    expect(redraws()).toBeGreaterThanOrEqual(3);
  });

  it("clears composer selection on single click without drag", () => {
    const compRows = ["╰─ draft text"];
    const { pointer } = build({
      composerGeometry: () => ({ top: 10, bottom: 10, rows: compRows }),
    });

    // Make selection
    pointer.handle(parseMouseReport("\x1b[<0;5;11M")!);
    pointer.handle(parseMouseReport("\x1b[<32;15;11M")!);
    pointer.handle(parseMouseReport("\x1b[<0;15;11m")!);
    expect(pointer.composerSelection).toBeDefined();

    // Single click
    pointer.handle(parseMouseReport("\x1b[<0;6;11M")!);
    pointer.handle(parseMouseReport("\x1b[<0;6;11m")!);
    expect(pointer.composerSelection).toBeUndefined();
  });
});
