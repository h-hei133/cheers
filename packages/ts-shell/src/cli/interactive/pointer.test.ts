import { describe, expect, it, vi } from "vitest";
import { Editor } from "../../presentation/tui/editor.js";
import { layoutComposer } from "../../presentation/tui/composer/layout.js";
import { Pointer } from "./pointer.js";
import { parseMouseReport } from "../../presentation/tui/input/mouse.js";
import type { InteractiveView } from "../../presentation/tui/surface/contract.js";
import { SuggestionList } from "../../presentation/tui/chrome/suggestions.js";
import { createViewState, type ViewContext } from '../../presentation/tui/surface/contract.js';
import { InteractiveSurface } from '../../presentation/tui/surface/view.js';
import type { Block } from '../../presentation/tui/transcript/blocks.js';

function composerGeometry(text: string, top = 10, width = 40) {
  const editor = new Editor(); editor.setText(text);
  const layout = layoutComposer(editor, { busy: false }, width);
  return { top, bottom: top + layout.height - 1, rows: layout.rows.map(row => row.rendered), layout };
}

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
      revision: 0,
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

function blockSurface(block: Block) {
  const state = createViewState();
  state.transcript.append(block);
  const context: ViewContext = { facts: () => ({ model: 'test', provider: 'test' }), statusItems: () => [], activity: () => undefined,
    busy: () => true, queuedCount: () => 0, now: () => 5000, ambient: () => ({ openTodos: 0, peerSessions: 0 }),
    cancelArmed: () => false, overlayFullScreen: () => false, overlayRows: () => [], selection: () => undefined };
  const view = new InteractiveSurface(context, state);
  const copied: string[] = [];
  let current: InteractiveView = view;
  const pointer = new Pointer({ view: () => current, rows: () => current.contentRows(), copy: text => copied.push(text), redraw: vi.fn() });
  view.renderFrame({ columns: 60, rows: 16 });
  const row = Array.from({ length: 16 }, (_, index) => index).find(index => view.blockAtScreenRow(index) === block)!;
  const event = { button: 0, shift: false, alt: false, ctrl: false, row, column: 2 };
  return { view, pointer, copied, event, swap: (next: InteractiveView) => { current = next; } };
}

describe('pointer block clicks', () => {
  it.each([false, true])('opens a live collapsed thinking prefix across a delta (repaint=%s)', repaint => {
    const block: Block = { kind: 'thinking', text: 'initial reasoning', elapsedMs: 1000, collapsed: true, finalized: false };
    const { view, pointer, copied, event } = blockSurface(block);
    pointer.handle({ ...event, kind: 'press' });
    view.transcript.update(block, current => { current.text += ' plus a new delta'; current.elapsedMs = 1001; });
    if (repaint) view.renderFrame({ columns: 60, rows: 16 });
    pointer.handle({ ...event, kind: 'release' });
    expect(block.collapsed).toBe(false);
    expect(copied).toEqual([]);
    expect(pointer.selection).toBeUndefined();
  });

  it.each(['rewritten body', 'replaced block', 'changed collapse', 'changed metadata', 'different row',
    'resize', 'invalidated layout', 'swapped view', 'scroll', 'drag away and back', 'changed painted row', 'painted elapsed change'] as const)
  ('rejects a thinking click after %s', change => {
    const block: Block = { kind: 'thinking', text: 'initial reasoning', collapsed: true, finalized: false };
    const fixture = blockSurface(block);
    const { view, pointer, copied, event } = fixture;
    const collapse = vi.spyOn(view.transcript, 'setCollapsed');
    pointer.handle({ ...event, kind: 'press' });
    view.transcript.setText(block, `${block.text} plus a new delta`);
    let release = event;
    if (change === 'rewritten body') view.transcript.setText(block, 'replacement reasoning');
    if (change === 'replaced block') { view.transcript.clear(); view.transcript.append({ ...block }); }
    if (change === 'changed collapse') view.transcript.update(block, current => { current.collapsed = false; });
    if (change === 'changed metadata') view.transcript.update(block, current => { current.title = 'different target'; });
    if (change === 'different row') release = { ...event, row: event.row + 1 };
    if (change === 'resize') view.renderFrame({ columns: 61, rows: 16 });
    if (change === 'invalidated layout') view.invalidateLayout();
    if (change === 'swapped view') fixture.swap(blockSurface(block).view);
    if (change === 'scroll') vi.spyOn(view, 'selectionTop').mockReturnValue(view.selectionTop() + 1);
    if (change === 'drag away and back') pointer.handle({ ...event, column: event.column + 1, kind: 'drag' });
    if (change === 'changed painted row') vi.spyOn(view, 'contentRows').mockReturnValue(view.contentRows().map(() => 'changed row'));
    if (change === 'painted elapsed change') {
      view.transcript.update(block, current => { current.elapsedMs = 1000; });
      view.renderFrame({ columns: 60, rows: 16 });
    }
    pointer.handle({ ...release, kind: 'release' });
    expect(collapse).not.toHaveBeenCalled();
    expect(copied).toEqual([]);
  });

  it.each(['tool', 'diff', 'expanded thinking'] as const)('keeps unchanged %s clicks working', kind => {
    const block: Block = kind === 'expanded thinking'
      ? { kind: 'thinking', text: 'reasoning', collapsed: false, finalized: true }
      : { kind: 'tool', title: 'read', text: 'result', status: 'ok', collapsed: true, finalized: true,
        ...(kind === 'diff' ? { diff: '--- a/file\n+++ b/file\n@@ -1 +1 @@\n-old\n+new' } : {}) };
    const { pointer, copied, event } = blockSurface(block);
    pointer.handle({ ...event, kind: 'press' });
    pointer.handle({ ...event, kind: 'release' });
    expect(block.collapsed).toBe(kind === 'expanded thinking');
    expect(copied).toEqual([]);
  });

  it('keeps text selection and copy stale when a hidden thinking delta arrives', () => {
    const block: Block = { kind: 'thinking', text: 'initial reasoning', collapsed: true, finalized: false };
    const { view, pointer, copied, event } = blockSurface(block);
    pointer.handle({ ...event, kind: 'press' });
    pointer.handle({ ...event, column: event.column + 4, kind: 'drag' });
    view.transcript.setText(block, `${block.text} plus a new delta`);
    expect(pointer.selection).toBeUndefined();
    expect(pointer.copySelection()).toBe(false);
    pointer.handle({ ...event, kind: 'release' });
    expect(block.collapsed).toBe(true);
    expect(copied).toEqual([]);
  });

  it.each(['tool', 'expanded thinking'] as const)('rejects changed %s text during a click', kind => {
    const block: Block = { kind: kind === 'tool' ? 'tool' : 'thinking', text: 'original', collapsed: kind === 'tool', finalized: false };
    const { view, pointer, copied, event } = blockSurface(block);
    const collapse = vi.spyOn(view.transcript, 'setCollapsed');
    pointer.handle({ ...event, kind: 'press' });
    view.transcript.setText(block, `${block.text} appended`);
    view.renderFrame({ columns: 60, rows: 16 });
    pointer.handle({ ...event, kind: 'release' });
    expect(collapse).not.toHaveBeenCalled();
    expect(copied).toEqual([]);
  });
});

it('ignores uncaptured motion without clearing a drag, toggling a block or redrawing the transcript', () => {
  const { pointer, surface, redraws } = build();
  pointer.handle(parseMouseReport('\x1b[<0;3;1M')!);
  vi.mocked(surface.blockAtScreenRow).mockClear();
  pointer.handle(parseMouseReport('\x1b[<32;8;3M')!);
  const selection = pointer.selection, before = redraws();
  pointer.handle(parseMouseReport('\x1b[<35;5;2M')!);
  expect(pointer.selection).toEqual(selection);
  expect(redraws()).toBe(before); expect(surface.blockAtScreenRow).not.toHaveBeenCalled();
  expect(surface.transcript.setCollapsed).not.toHaveBeenCalled();
  pointer.clearSelection();
});

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
    vi.mocked(surface.blockAtScreenRow).mockClear();
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

  it("invalidates a transcript drag when the source layout revision changes", () => {
    let revision = 1;
    const { pointer, copied } = build({ selectionRevision: () => revision });
    pointer.handle(parseMouseReport("\x1b[<0;3;1M")!);
    pointer.handle(parseMouseReport("\x1b[<32;21;2M")!);
    expect(pointer.selection).toBeDefined();
    revision += 1;
    expect(pointer.selection).toBeUndefined();
    pointer.handle(parseMouseReport("\x1b[<0;21;2m")!);
    expect(copied).toEqual([]);
  });

  it("invalidates a transcript drag before the next frame when transcript text changes", () => {
    const { pointer, copied, surface } = build();
    pointer.handle(parseMouseReport("\x1b[<0;3;1M")!);
    pointer.handle(parseMouseReport("\x1b[<32;21;2M")!);
    expect(pointer.selection).toBeDefined();
    (surface.transcript as unknown as { revision: number }).revision += 1;
    pointer.handle(parseMouseReport("\x1b[<0;21;2m")!);
    expect(copied).toEqual([]);
  });

  it("keeps pointer-owned auto-scroll current while rejecting an external scroll", () => {
    let top = 0;
    const scroll = vi.fn((delta: number) => {
      top += delta;
      return true;
    });
    const { pointer } = build({
      scroll,
      selectionTop: () => top,
      composerGeometry: () => composerGeometry("one\ntwo", 15),
    });
    pointer.handle(parseMouseReport("\x1b[<0;11;6M")!);
    pointer.handle(parseMouseReport("\x1b[<32;11;1M")!);
    expect(scroll).toHaveBeenCalledWith(-1);
    expect(pointer.selection).toBeDefined();
    pointer.handle(parseMouseReport("\x1b[<32;11;2M")!);
    expect(pointer.selection).toBeDefined();
    top += 1;
    expect(pointer.selection).toBeUndefined();
    pointer.handle(parseMouseReport("\x1b[<0;11;2m")!);
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
      composerGeometry: () => composerGeometry("one\ntwo", 15),
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
  it.each([false, true])("copies exact source through wraps and whitespace (reverse=%s)", reverse => {
    const source = "  ╰─ keep\t end  \n\n    next ❯  ";
    const geometry = composerGeometry(source, 10, 16);
    const { pointer, copied } = build({ composerGeometry: () => geometry });
    const start = { row: geometry.top, column: 0 };
    const end = { row: geometry.bottom, column: 15 };
    const [from, to] = reverse ? [end, start] : [start, end];
    const event = { button: 0, shift: false, alt: false, ctrl: false };
    pointer.handle({ ...event, ...from, kind: "press" });
    pointer.handle({ ...event, ...to, kind: "drag" });
    expect(pointer.composerSelection).toEqual({ sourceRevision: geometry.layout.sourceRevision, start: 0, end: source.length });
    pointer.handle({ ...event, ...to, kind: "release" });
    expect(copied).toEqual([source]);
  });

  it("copies whitespace-only source and cancels a drag whose geometry or revision changes", () => {
    let geometry = composerGeometry("  \t  ");
    const { pointer, copied, surface } = build({ composerGeometry: () => geometry });
    const event = { button: 0, shift: false, alt: false, ctrl: false, row: geometry.top + geometry.layout.rows.find(row => row.kind === "content")!.screenRow };
    pointer.handle({ ...event, column: 0, kind: "press" });
    pointer.handle({ ...event, column: 39, kind: "release" });
    expect(copied).toEqual(["  \t  "]);
    pointer.handle({ ...event, column: 0, kind: "press" });
    geometry = composerGeometry("changed text", 10, 16);
    pointer.handle({ ...event, column: 12, kind: "drag" });
    pointer.handle({ ...event, column: 12, kind: "release" });
    expect(pointer.composerSelection).toBeUndefined();
    expect(copied).toEqual(["  \t  "]);
    expect(surface.blockAtScreenRow).not.toHaveBeenCalled();
    pointer.handle({ ...event, column: 5, kind: "press" });
    geometry = composerGeometry("changed text", 9, 40);
    pointer.handle({ ...event, column: 12, kind: "release" });
    expect(copied).toHaveLength(1);
  });

  it("drags across composer rows and copies draft text on release", () => {
    const geometry = composerGeometry("line 1 of input draft\nline 2 of input draft");
    const { pointer, copied, redraws } = build({
      composerGeometry: () => geometry,
    });

    const inputRow = geometry.top + geometry.layout.rows.find(row => row.kind === "content")!.screenRow + 1;
    // Mouse reports use one-based physical coordinates.
    pointer.handle(parseMouseReport(`\x1b[<0;1;${inputRow}M`)!);
    expect(pointer.composerSelection).toBeDefined();
    expect(pointer.selection).toBeUndefined();

    // Drag to col 20 (1-based is 21)
    pointer.handle(parseMouseReport(`\x1b[<32;21;${inputRow}M`)!);
    expect(pointer.composerSelection).toBeDefined();

    // Release
    pointer.handle(parseMouseReport(`\x1b[<0;21;${inputRow}m`)!);
    expect(copied.length).toBe(1);
    expect(copied[0]).toContain("line 1");
    expect(redraws()).toBeGreaterThanOrEqual(3);
  });

  it("clears composer selection on single click without drag", () => {
    const geometry = composerGeometry("draft text");
    const { pointer } = build({
      composerGeometry: () => geometry,
    });

    const inputRow = geometry.top + geometry.layout.rows.find(row => row.kind === "content")!.screenRow + 1;
    // Make selection
    pointer.handle(parseMouseReport(`\x1b[<0;5;${inputRow}M`)!);
    pointer.handle(parseMouseReport(`\x1b[<32;15;${inputRow}M`)!);
    pointer.handle(parseMouseReport(`\x1b[<0;15;${inputRow}m`)!);
    expect(pointer.composerSelection).toBeDefined();

    // Single click
    pointer.handle(parseMouseReport(`\x1b[<0;6;${inputRow}M`)!);
    pointer.handle(parseMouseReport(`\x1b[<0;6;${inputRow}m`)!);
    expect(pointer.composerSelection).toBeUndefined();
  });
});
