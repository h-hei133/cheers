import { describe, expect, it } from "vitest";
import { Editor } from "../editor.js";
import { CURSOR_MARKER } from "../render/paint.js";
import { stripAnsi } from "../text/ansi.js";
import { visibleWidth } from "../text/measure.js";
import type { ComposerLayout, ComposerLayoutRow } from "./contract.js";
import { composerTextWidth, layoutComposer } from "./layout.js";
import { highlightComposer, selectionFromPoints } from "./projection.js";

type ContentRow = Extract<ComposerLayoutRow, { readonly kind: "content" }>;

function contentRows(layout: ComposerLayout): ContentRow[] {
  return layout.rows.filter((row): row is ContentRow => row.kind === "content");
}

function draft(source: string): Editor {
  const editor = new Editor();
  editor.setText(source);
  return editor;
}

function copied(layout: ComposerLayout, from: { row: number; column: number }, to: { row: number; column: number }): string {
  const range = selectionFromPoints(layout, from, to);
  return layout.source.slice(range.start, range.end);
}

describe("composer source layout", () => {
  it("copies exact indentation, cue characters, tabs, trailing whitespace and logical breaks across soft wraps", () => {
    const source = "  ╰─ keep\t end  \n\n    next ❯ line  ";
    const layout = layoutComposer(draft(source), { busy: false }, 16);
    const rows = contentRows(layout);
    const start = { row: 0, column: 0 };
    const end = { row: rows.length - 1, column: 100 };
    expect(rows.map((row) => row.breakAfter)).toContain("soft");
    expect(rows.map((row) => row.breakAfter)).toContain("logical");
    expect(copied(layout, start, end)).toBe(source);
    expect(copied(layout, end, start)).toBe(source);
    expect(rows.every((row) => row.contentColumn === 5)).toBe(true);
    expect(stripAnsi(rows[0]!.rendered).startsWith("╰─   ")).toBe(true);
    expect(stripAnsi(rows[1]!.rendered).startsWith("     ")).toBe(true);
  });

  it("selects either display cell of a tab as the single original tab and shades both cells", () => {
    const layout = layoutComposer(draft("a\tb"), { busy: false }, 20);
    const row = contentRows(layout)[0]!;
    const tab = row.cells[1]!;
    const point = { row: 0, column: tab.columnEnd - 1 };
    const range = selectionFromPoints(layout, point, point);
    expect(layout.source.slice(range.start, range.end)).toBe("\t");
    expect(tab.columnEnd - tab.columnStart).toBe(2);
    expect(highlightComposer(layout, range)[0]).toContain("\x1b[7m  \x1b[27m");
    expect(highlightComposer(layout, range)[0]).toContain(CURSOR_MARKER);
  });

  it("never splits CJK, combining clusters or emoji ZWJ source boundaries", () => {
    const source = "中e\u0301👩‍💻";
    const layout = layoutComposer(draft(source), { busy: false }, 30);
    const row = contentRows(layout)[0]!;
    expect(row.cells).toHaveLength(3);
    for (const [index, expected] of ["中", "e\u0301", "👩‍💻"].entries()) {
      const cell = row.cells[index]!;
      const point = { row: 0, column: cell.columnEnd - 1 };
      expect(copied(layout, point, point)).toBe(expected);
    }
    const first = row.cells[0]!;
    const last = row.cells[2]!;
    expect(copied(layout, { row: 0, column: last.columnEnd - 1 }, { row: 0, column: first.columnStart + 1 })).toBe(source);
  });

  it("adds no newline at a soft break but retains logical and empty-line breaks", () => {
    const layout = layoutComposer(draft("abcdefghij\n\n  last  "), { busy: false }, 12);
    const rows = contentRows(layout);
    expect(rows[0]!.breakAfter).toBe("soft");
    expect(copied(layout, { row: 0, column: rows[0]!.contentColumn + 3 }, { row: 1, column: rows[1]!.contentColumn + 1 })).toBe("defg");
    expect(copied(layout, { row: 1, column: 100 }, { row: 3, column: 0 })).toBe("\n\n");
  });

  it("clamps gutter and padding to source boundaries without selecting decoration", () => {
    const layout = layoutComposer(draft("  x  "), { busy: false }, 20);
    expect(copied(layout, { row: 0, column: 0 }, { row: 0, column: 4 })).toBe("");
    expect(copied(layout, { row: 0, column: 11 }, { row: 0, column: 19 })).toBe("");
    const all = selectionFromPoints(layout, { row: 0, column: 0 }, { row: 0, column: 19 });
    const highlighted = highlightComposer(layout, all)[0]!;
    expect(highlighted).toContain("\x1b[7m  x  ");
    expect(stripAnsi(highlighted)).toBe(stripAnsi(layout.rows[0]!.rendered));
    expect(highlighted.indexOf("\x1b[7m")).toBeGreaterThan(highlighted.indexOf("╰─"));
  });

  it("keeps visible source offsets when the editor viewport starts after hidden text", () => {
    const editor = draft("hidden\n  visible\tA  \nlast");
    const layout = layoutComposer(editor, { busy: false }, 40, 2);
    expect(layout.viewportStart).toBe(1);
    expect(layout.height).toBe(2);
    expect(contentRows(layout)[0]!.sourceStart).toBe(7);
    expect(copied(layout, { row: 0, column: 0 }, { row: 1, column: 100 })).toBe("  visible\tA  \nlast");
    editor.move("doc-start");
    const atTop = layoutComposer(editor, { busy: false }, 40, 2);
    expect(atTop.viewportStart).toBe(0);
    expect(atTop.rows[0]!.rendered).toContain(CURSOR_MARKER);
  });

  it("reprojects a source selection after resize and refuses it after the draft changes", () => {
    const editor = draft("abcdefghij");
    const wide = layoutComposer(editor, { busy: false }, 30);
    const range = selectionFromPoints(wide, { row: 0, column: 8 }, { row: 0, column: 11 });
    expect(wide.source.slice(range.start, range.end)).toBe("defg");
    const narrow = layoutComposer(editor, { busy: false }, 12);
    expect(highlightComposer(narrow, range).filter((row) => row.includes("\x1b[7m"))).toHaveLength(2);
    editor.insert("!");
    const changed = layoutComposer(editor, { busy: false }, 12);
    expect(highlightComposer(changed, range)).toEqual(changed.rows.map((row) => row.rendered));
  });

  it("never renders or maps outside the real width, including indivisible wide glyphs", () => {
    for (const width of [0, 1, 2, 3, 4, 5, 6, 7, 8, 20, 40, 80]) {
      const editor = draft("中\t👩‍💻abc");
      const layout = layoutComposer(editor, { busy: true }, width, 4);
      expect(composerTextWidth(width)).toBeLessThanOrEqual(width);
      expect(layout.height).toBeLessThanOrEqual(4);
      for (const row of contentRows(layout)) {
        expect(visibleWidth(row.rendered)).toBeLessThanOrEqual(width);
        expect(row.cells.every((cell) => cell.columnStart >= 0 && cell.columnEnd <= width)).toBe(true);
        const marker = row.rendered.indexOf(CURSOR_MARKER);
        if (marker >= 0) expect(visibleWidth(row.rendered.slice(0, marker))).toBeLessThan(width);
      }
      if (width === 0) expect(layout.rows).toEqual([]);
    }
    const tiny = layoutComposer(draft("中"), { busy: false }, 1);
    expect(stripAnsi(tiny.rows[0]!.rendered)).toBe("�");
    expect(copied(tiny, { row: 0, column: 0 }, { row: 0, column: 0 })).toBe("中");
    expect(layoutComposer(draft("text"), { busy: false }, 40, 0).rows).toEqual([]);
  });

  it("keeps placeholder text unselectable and width bounded", () => {
    const editor = draft("");
    editor.placeholder = "A long placeholder";
    const layout = layoutComposer(editor, { busy: false }, 10);
    expect(visibleWidth(layout.rows[0]!.rendered)).toBeLessThanOrEqual(10);
    expect(contentRows(layout)[0]!.cells).toEqual([]);
    expect(copied(layout, { row: 0, column: 0 }, { row: 0, column: 100 })).toBe("");
  });

  it("clamps frame rows to adjacent source without inventing frame characters", () => {
    const content = layoutComposer(draft("one\ntwo"), { busy: false }, 20);
    const layout: ComposerLayout = {
      ...content, height: 5, rows: [
        { kind: "decoration", screenRow: 0, rendered: "top" },
        { ...content.rows[0]!, screenRow: 1 },
        { kind: "decoration", screenRow: 2, rendered: "gap" },
        { ...content.rows[1]!, screenRow: 3 },
        { kind: "decoration", screenRow: 4, rendered: "bottom" },
      ],
    };
    expect(copied(layout, { row: 0, column: 0 }, { row: 4, column: 10 })).toBe("one\ntwo");
    expect(copied(layout, { row: 2, column: 0 }, { row: 2, column: 10 })).toBe("");
    expect(copied(layout, { row: 2, column: 0 }, { row: 3, column: 6 })).toBe("tw");
  });
});
