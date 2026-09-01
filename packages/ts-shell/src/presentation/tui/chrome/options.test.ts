import { describe, expect, it } from "vitest";
import { OptionModel, type Option } from "./options.js";
import { scrollWindow } from "./window.js";

const options: Option[] = [
  { id: "a", label: "alpha", detail: "first letter" },
  { id: "b", label: "beta", detail: "second letter", selected: true },
  { id: "c", label: "gamma", detail: "third letter", disabled: true },
  { id: "d", label: "delta", note: "greek" },
];

function model(): OptionModel {
  const created = new OptionModel();
  created.setOptions(options);
  return created;
}

describe("filtering", () => {
  it("matches on any field, not just the label", () => {
    // A user typing "greek" means the row mentioning greek, wherever it says so.
    const list = model();
    list.setFilter("greek");
    expect(list.visible.map((option) => option.id)).toEqual(["d"]);
    list.setFilter("second");
    expect(list.visible.map((option) => option.id)).toEqual(["b"]);
  });

  it("is case insensitive and trims", () => {
    const list = model();
    list.setFilter("  ALPHA ");
    expect(list.total).toBe(1);
  });

  it("returns everything for an empty filter", () => {
    const list = model();
    list.setFilter("");
    expect(list.total).toBe(options.length);
  });

  it("grows and shrinks with typed characters", () => {
    const list = model();
    list.appendFilter("del");
    expect(list.total).toBe(1);
    list.backspaceFilter();
    expect(list.total).toBe(1);
    list.backspaceFilter();
    expect(list.total).toBe(3);
    list.backspaceFilter();
    expect(list.total).toBe(options.length);
  });

  it("keeps the cursor in range when the match set shrinks", () => {
    const list = model();
    list.step(-1);
    list.setFilter("alpha");
    expect(list.current()?.id).toBe("a");
  });
});

describe("cursor", () => {
  it("skips rows that cannot be chosen", () => {
    const list = model();
    list.step(1);
    expect(list.current()?.id).toBe("b");
    list.step(1);
    expect(list.current()?.id).toBe("d");
  });

  it("wraps at both ends", () => {
    const list = model();
    list.step(-1);
    expect(list.current()?.id).toBe("d");
    list.step(1);
    expect(list.current()?.id).toBe("a");
  });

  it("does nothing on an empty match set", () => {
    const list = model();
    list.setFilter("zzz");
    list.step(1);
    expect(list.current()).toBeUndefined();
  });
});

describe("multi-select", () => {
  it("starts from whatever was already selected", () => {
    expect(model().chosenIds()).toEqual(["b"]);
  });

  it("toggles the row under the cursor", () => {
    const list = model();
    list.toggle();
    expect(list.chosenIds()).toEqual(["a", "b"]);
    list.toggle();
    expect(list.chosenIds()).toEqual(["b"]);
  });

  it("refuses to toggle a row that cannot be chosen", () => {
    const list = new OptionModel();
    list.setOptions([{ id: "x", label: "x", disabled: true }]);
    list.toggle();
    expect(list.chosenIds()).toEqual([]);
  });

  it("reports ids in the supplied order, not the order ticked", () => {
    const list = model();
    list.step(-1);
    list.toggle();
    expect(list.chosenIds()).toEqual(["b", "d"]);
  });
});

describe("scroll window", () => {
  it("shows the whole list when it fits", () => {
    expect(scrollWindow(0, 3, 10, 0)).toEqual({ offset: 0, count: 3, above: 0, below: 0 });
  });

  it("follows the cursor by the minimum distance", () => {
    expect(scrollWindow(5, 10, 3, 0).offset).toBe(3);
    expect(scrollWindow(2, 10, 3, 3).offset).toBe(2);
  });

  it("never scrolls past the end", () => {
    expect(scrollWindow(9, 10, 4, 9).offset).toBe(6);
  });

  it("reports what is hidden in each direction", () => {
    const window = scrollWindow(5, 10, 2, 4);
    expect(window.above).toBe(4);
    expect(window.below).toBe(4);
  });

  it("handles a zero row budget", () => {
    expect(scrollWindow(0, 5, 0, 0)).toEqual({ offset: 0, count: 0, above: 0, below: 5 });
  });
});
