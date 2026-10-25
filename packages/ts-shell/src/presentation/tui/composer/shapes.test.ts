import { describe, expect, it, vi } from "vitest";
import { defaultTheme } from "../../theme/theme.js";
import { Editor } from "../editor.js";
import { CURSOR_MARKER } from "../render/paint.js";
import { stripAnsi } from "../text/ansi.js";
import { visibleWidth } from "../text/measure.js";
import type { ComposerLayout, ComposerLayoutRow, ComposerShapeId } from "./contract.js";
import { composerTextWidth, layoutComposer } from "./layout.js";
import { highlightComposer, selectionFromPoints } from "./projection.js";
import { COMPOSER_SHAPES, isComposerShape } from "./shapes.js";

const shapes = Object.keys(COMPOSER_SHAPES) as ComposerShapeId[];
const status = { left: "Model · project", right: "Context 12%", full: "Model · project · Context 12%" };
type ContentRow = Extract<ComposerLayoutRow, { readonly kind: "content" }>;

function contents(layout: ComposerLayout): ContentRow[] {
  return layout.rows.filter((row): row is ContentRow => row.kind === "content");
}

function draft(text: string, focused = true): Editor {
  const editor = new Editor();
  editor.setText(text);
  editor.focused = focused;
  return editor;
}

describe("composer shapes", () => {
  it("wraps large drafts only once for shapes without adaptive side geometry", () => {
    for (const shape of ["default", "band", "borderless", "top-rule", "padded-rules", "field"] as const) {
      const editor = draft("long draft\n".repeat(1000));
      const wrap = vi.spyOn(editor, "layout");
      layoutComposer(editor, { busy: false, shape }, 80, 10);
      expect(wrap).toHaveBeenCalledOnce();
    }
  });
  it("registers exactly the eight neutral IDs and defaults to the rule shape", () => {
    expect(shapes).toEqual(["default", "band", "borderless", "top-rule", "padded-rules", "field", "rail", "box"]);
    for (const shape of shapes) expect(isComposerShape(shape)).toBe(true);
    for (const unknown of ["constructor", "toString", "unknown", "", null, 1]) expect(isComposerShape(unknown)).toBe(false);
    const rows = layoutComposer(draft("x"), { busy: false }, 40).rows.map((row) => stripAnsi(row.rendered));
    expect(rows).toHaveLength(3);
    expect(rows[0]).toBe("─".repeat(40));
    expect(rows[1]).toMatch(/^❯ x/);
    expect(rows[2]).toBe("─".repeat(40));
  });

  it("reserves real whitespace independently from gutter and side decoration", () => {
    const expected = { default: 37, band: 35, borderless: 37, "top-rule": 37, "padded-rules": 38, field: 36, rail: 37, box: 36 };
    for (const shape of shapes) {
      expect(composerTextWidth(40, shape)).toBe(expected[shape]);
      const row = contents(layoutComposer(draft("x", false), { busy: false, shape }, 40))[0]!;
      const plain = stripAnsi(row.rendered);
      expect(plain.slice(row.contentColumn - 1, row.contentColumn)).toBe(" ");
      expect(plain.slice(row.cells[0]!.columnEnd, row.cells[0]!.columnEnd + 1)).toBe(" ");
    }
  });

  it.each(['default', 'borderless', 'top-rule'] as const)('starts the %s arrow at the boundary and aligns continuation text', shape => {
    const layout = layoutComposer(draft('first\n  中e\u0301👩‍💻'), { busy: false, shape }, 40);
    const rows = contents(layout);
    expect(stripAnsi(rows[0]!.rendered)).toMatch(/^❯ first/);
    expect(stripAnsi(rows[1]!.rendered)).toMatch(/^    中/);
    expect(rows.map(row => row.contentColumn)).toEqual([2, 2]);
    const marker = rows[1]!.rendered.indexOf(CURSOR_MARKER);
    expect(visibleWidth(rows[1]!.rendered.slice(0, marker))).toBe(9);
  });

  it("attaches the correct status groups, rules, gap and filled band", () => {
    const expectedHeights = { default: 4, band: 2, borderless: 2, "top-rule": 4, "padded-rules": 4, field: 3, rail: 3, box: 3 };
    for (const shape of shapes) {
      const layout = layoutComposer(draft("draft"), { busy: false, shape, status }, 80);
      const rows = layout.rows.map((row) => stripAnsi(row.rendered));
      expect(layout.height).toBe(expectedHeights[shape]);
      const metadata = COMPOSER_SHAPES[shape];
      if (metadata.statusAttachment === "top-rule-chip") {
        expect(rows[0]).toContain(status.right);
        expect(rows[0]).not.toContain(status.left);
        expect(layout.rows[0]!.rendered).toContain(defaultTheme.bgOpen("statusBandBg"));
      } else if (metadata.statusAttachment === "top-band" || metadata.statusAttachment === "top-border") {
        expect(rows[0]).toContain(status.full);
      }
      if (metadata.bottomBar !== "none") expect(rows.at(-1)).toBe(metadata.bottomBar === "left" ? status.left : status.full);
      if (metadata.gap) expect(rows.at(-2)).toBe("");
    }
  });

  it("copies exact source in both drag directions through every shape's decoration", () => {
    const source = "  ❯ \t中e\u0301👩‍💻 keep  \n\n  ╰─ tail  ";
    for (const shape of shapes) {
      const layout = layoutComposer(draft(source), { busy: false, shape, status }, 20);
      const start = { row: 0, column: 0 };
      const end = { row: layout.height - 1, column: 19 };
      for (const [from, to] of [[start, end], [end, start]]) {
        const selection = selectionFromPoints(layout, from!, to!);
        expect(layout.source.slice(selection.start, selection.end)).toBe(source);
        const shaded = highlightComposer(layout, selection);
        for (const row of layout.rows) if (row.kind === "decoration") expect(shaded[row.screenRow]).toBe(row.rendered);
      }
    }
  });

  it("keeps all rows, source cells and caret inside actual width and total height", () => {
    for (const shape of shapes) for (const width of [80, 40, 20, 8, 1, 0]) for (const height of [8, 4, 2, 1, 0]) {
      const layout = layoutComposer(draft("中\t👩‍💻 abcdefghijklmn\nsecond\nlast"), { busy: true, shape, status }, width, height);
      expect(layout.height, `${shape} ${width}x${height}`).toBeLessThanOrEqual(height);
      expect(layout.height).toBe(layout.rows.length);
      if (width === 0 || height === 0) expect(layout.rows).toEqual([]);
      else expect(contents(layout).length).toBeGreaterThan(0);
      for (const row of layout.rows) {
        expect(visibleWidth(row.rendered), `${shape} ${width}x${height}`).toBeLessThanOrEqual(width);
        const marker = row.rendered.indexOf(CURSOR_MARKER);
        if (marker >= 0) expect(visibleWidth(row.rendered.slice(0, marker))).toBeLessThan(width);
        if (row.kind === "content") expect(row.cells.every((cell) => cell.columnStart >= 0 && cell.columnEnd <= width)).toBe(true);
      }
    }
  });

  it("uses the same empty EOL tail for field, rail and box, including a full-width caret", () => {
    for (const shape of ["field", "rail", "box"] as const) {
      const source = "x".repeat(composerTextWidth(40, shape));
      const layout = layoutComposer(draft(source), { busy: false, shape }, 40, 4);
      const row = contents(layout)[0]!;
      expect(row.imeSafeCursorTail).toBe(true);
      expect(row.cursorOverflow).toBe(1);
      expect(stripAnsi(row.rendered.slice(row.rendered.indexOf(CURSOR_MARKER) + CURSOR_MARKER.length))).toBe("");
      if (shape === "box") expect(stripAnsi(layout.rows.at(-1)!.rendered)).toBe(`╰${"─".repeat(38)}╯`);
      const middle = draft("abc\nnext");
      middle.move("doc-start");
      middle.move("line-end");
      const rows = contents(layoutComposer(middle, { busy: false, shape }, 40));
      expect(rows[0]!.imeSafeCursorTail).toBe(true);
      expect(rows[1]!.imeSafeCursorTail).toBe(false);
    }
  });

  it("merges the box bottom only without an EOL caret and preserves source mapping", () => {
    const editor = draft("  last  ");
    editor.move("doc-start");
    const merged = layoutComposer(editor, { busy: false, shape: "box" }, 40);
    expect(merged.height).toBe(2);
    expect(merged.rows.at(-1)!.kind).toBe("content");
    expect(stripAnsi(merged.rows.at(-1)!.rendered)).toMatch(/^╰  .*╯$/);
    editor.move("doc-end");
    const tail = layoutComposer(editor, { busy: false, shape: "box" }, 40, 2);
    expect(tail.height).toBe(2);
    expect(tail.rows[0]!.kind).toBe("content");
    expect(tail.rows[1]!.kind).toBe("decoration");
    expect(stripAnsi(tail.rows[1]!.rendered)).toMatch(/^╰─+╯$/);
  });

  it("projects a scrollbar from the real editor viewport and reserves the rail's right cell", () => {
    const source = Array.from({ length: 20 }, (_, index) => `line ${index}`).join("\n");
    for (const shape of ["field", "rail", "box"] as const) {
      const editor = draft(source, false);
      const bottom = layoutComposer(editor, { busy: false, shape }, 40, 5);
      const rows = contents(bottom);
      expect(bottom.viewportStart).toBe(20 - rows.length);
      expect(rows.some((row) => row.scrollbarThumb)).toBe(true);
      if (shape === "rail") expect(rows[0]!.contentCells).toBe(composerTextWidth(40, shape) - 1);
      const thumb = rows.find((row) => row.scrollbarThumb)!;
      expect(stripAnsi(thumb.rendered).at(-1)).toBe("█");
      expect(editor.layout(rows[0]!.contentCells, rows.length).totalRows).toBe(20);
      editor.move("doc-start");
      const top = layoutComposer(editor, { busy: false, shape }, 40, 5);
      expect(top.viewportStart).toBe(0);
      expect(contents(top)[0]!.scrollbarThumb).toBe(true);
    }
  });

  it("keeps an unchanged scrolled EOL frame stable while reserving optional chrome", () => {
    const editor = draft(Array.from({ length: 20 }, (_, index) => `row ${index}`).join("\n"));
    editor.move("doc-start");
    for (let index = 0; index < 5; index++) editor.move("down");
    editor.move("line-end");
    const first = layoutComposer(editor, { busy: false, shape: "box" }, 40, 3);
    const second = layoutComposer(editor, { busy: false, shape: "box" }, 40, 3);
    expect(second).toEqual(first);
  });

  it("previews geometry without changing editor scroll or the width used by vertical motion", () => {
    const editor = draft("abcdefghijklmnopqrstuvwxyz0123456789");
    editor.move("doc-start");
    for (let index = 0; index < 15; index++) editor.move("right");
    const initial = editor.layout(8, 3);
    editor.layout(3, 1, { preview: true });
    expect(editor.layout(8, 3)).toEqual(initial);
    editor.move("doc-start");
    editor.layout(8, 3);
    editor.layout(2, 1, { preview: true });
    editor.move("down");
    expect(editor.snapshot().cursor).toBe(8);
  });

  it("restores a filled surface after nested text resets without filling the IME tail", () => {
    for (const shape of ["field", "rail"] as const) {
      const row = contents(layoutComposer(draft("a\x1b[0mb\x1b[49mc"), { busy: false, shape }, 40))[0]!;
      const background = defaultTheme.bgOpen("statusBandBg");
      expect(row.rendered).toContain(`\x1b[0m${background}`);
      expect(row.rendered).toContain(`\x1b[49m${background}`);
      expect(stripAnsi(row.rendered.slice(row.rendered.indexOf(CURSOR_MARKER) + CURSOR_MARKER.length))).toBe("");
    }
  });
});
