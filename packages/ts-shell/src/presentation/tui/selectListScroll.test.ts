import { describe, it, expect, beforeEach } from "vitest";
import { SelectList } from "./selectList.js";

describe("SelectList Scrollable Window", () => {
  let list: SelectList;

  beforeEach(() => {
    list = new SelectList();
  });

  it("scrolls smoothly when items exceed maxVisible", () => {
    const items = [
      { value: "/1", label: "/1" },
      { value: "/2", label: "/2" },
      { value: "/3", label: "/3" },
      { value: "/4", label: "/4" },
      { value: "/5", label: "/5" },
      { value: "/6", label: "/6" },
      { value: "/7", label: "/7" },
      { value: "/8", label: "/8" },
    ];
    list.setItems(items);

    // Initial state: index 0
    expect(list.getSelectedIndex()).toBe(0);

    // Move down 6 times to trigger scroll windowing
    for (let i = 0; i < 6; i++) {
      list.moveDown();
    }
    expect(list.getSelectedIndex()).toBe(6);
    expect(list.getSelectedItem()?.value).toBe("/7");

    const rendered = list.render(60);
    expect(rendered.some((l) => l.includes("↓") || l.includes("↑"))).toBe(true);
  });
});
