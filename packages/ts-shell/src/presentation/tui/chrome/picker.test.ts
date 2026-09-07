import { describe, expect, it } from "vitest";
import { renderPanel } from "./panel.js";
import { renderModal } from "./modal.js";
import { OptionModel, type Option } from "./options.js";
import { visibleWidth } from "../text/measure.js";
import { stripAnsi } from "../text/ansi.js";
import { CURSOR_MARKER } from "../render/paint.js";
const many: Option[] = Array.from({ length: 30 }, (_, index) => ({
  id: `id-${index}`,
  label: `option ${index}`,
  detail: `detail for option ${index}`,
  note: `n${index}`,
}));

function model(options: readonly Option[] = many): OptionModel {
  const created = new OptionModel();
  created.setOptions(options);
  return created;
}

describe("inline panel", () => {
  it("stays inside its row budget", () => {
    const rows = renderPanel(model(), { title: "Pick", empty: "none", multiple: false }, 60, 8);
    expect(rows.length).toBeLessThanOrEqual(8);
  });

  it("never exceeds the width", () => {
    for (const row of renderPanel(model(), { title: "Pick", empty: "none", multiple: false }, 40, 10)) {
      expect(visibleWidth(row)).toBeLessThanOrEqual(40);
    }
  });

  it("says how much of the list it is hiding", () => {
    const rows = renderPanel(model(), { title: "Pick", empty: "none", multiple: false }, 60, 8).join("\n");
    expect(rows).toContain("more");
  });

  it("shows the live filter and the match count in the title row", () => {
    const list = model();
    list.setFilter("option 1");
    const head = stripAnsi(renderPanel(list, { title: "Pick", empty: "none", multiple: false }, 60, 8)[0]!);
    expect(head).toContain("Pick");
    expect(head).toContain("option 1");
    expect(head.trimEnd().endsWith("11")).toBe(true);
  });

  it("marks the cursor row with an arrow when one answer is wanted", () => {
    const rows = renderPanel(model(), { title: "Pick", empty: "none", multiple: false }, 60, 8);
    expect(stripAnsi(rows[1]!)).toContain("▸");
  });

  it("marks every row with a checkbox when several are wanted", () => {
    const rows = renderPanel(model(), { title: "Pick", empty: "none", multiple: true }, 60, 8);
    expect(stripAnsi(rows[1]!)).toMatch(/[◼◻]/);
    expect(stripAnsi(rows.at(-1)!)).toContain("space toggle");
  });

  it("explains an empty option set rather than showing a blank box", () => {
    const rows = renderPanel(model([]), { title: "Pick", empty: "nothing here", multiple: false }, 60, 8);
    expect(stripAnsi(rows.join("\n"))).toContain("nothing here");
  });
});

describe("full-screen modal", () => {
  it("fills exactly the given geometry", () => {
    const rows = renderModal(model(), { title: "Pick", empty: "none", detailRows: 2 }, 60, 20);
    expect(rows).toHaveLength(20);
    for (const row of rows) expect(visibleWidth(row)).toBe(60);
  });

  it("keeps its frame aligned at any width", () => {
    for (const width of [40, 61, 100]) {
      const rows = renderModal(model(), { title: "Pick", empty: "none", detailRows: 1 }, width, 12);
      const widths = new Set(rows.map((row) => visibleWidth(row)));
      expect(widths).toEqual(new Set([width]));
    }
  });

  it("gives each option its detail rows", () => {
    const rows = stripAnsi(renderModal(model(), { title: "Pick", empty: "none", detailRows: 1 }, 70, 14).join("\n"));
    expect(rows).toContain("option 0");
    expect(rows).toContain("detail for option 0");
  });

  it("explains an empty option set", () => {
    const rows = stripAnsi(renderModal(model([]), { title: "Pick", empty: "nothing here", detailRows: 2 }, 60, 12).join("\n"));
    expect(rows).toContain("nothing here");
  });

  it("still frames a screen too short for one whole option", () => {
    const rows = renderModal(model(), { title: "Pick", empty: "none", detailRows: 2 }, 40, 5);
    expect(rows).toHaveLength(5);
    for (const row of rows) expect(visibleWidth(row)).toBe(40);
  });

  it("renders dedicated search input row with proper cursor placement", () => {
    const m = model();
    const emptyRows = renderModal(m, { title: "Sessions", empty: "none", detailRows: 1 }, 60, 15);
    const searchEmpty = emptyRows[1]!;
    expect(stripAnsi(searchEmpty)).toContain("Search: Type to filter...");
    expect(searchEmpty.indexOf(CURSOR_MARKER)).toBeLessThan(searchEmpty.indexOf("Type to filter..."));

    m.setFilter("test-query");
    const queryRows = renderModal(m, { title: "Sessions", empty: "none", detailRows: 1 }, 60, 15);
    const searchQuery = queryRows[1]!;
    expect(stripAnsi(searchQuery)).toContain("Search: test-query");
    expect(searchQuery.indexOf(CURSOR_MARKER)).toBeGreaterThan(searchQuery.indexOf("test-query"));
    expect(stripAnsi(queryRows.join("\n"))).toContain("├");
  });
});
