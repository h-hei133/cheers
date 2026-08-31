import { describe, it, expect, beforeEach } from "vitest";
import { SelectList } from "./selectList.js";

describe("SelectList Interactive Component", () => {
  let list: SelectList;

  beforeEach(() => {
    list = new SelectList();
  });

  it("manages items and navigates selection index", () => {
    list.setItems([
      { value: "/help", label: "/help", description: "Show help" },
      { value: "/model", label: "/model", description: "Switch model" },
    ]);

    expect(list.getSelectedIndex()).toBe(0);
    expect(list.getSelectedItem()?.value).toBe("/help");

    list.moveDown();
    expect(list.getSelectedIndex()).toBe(1);
    expect(list.getSelectedItem()?.value).toBe("/model");

    list.moveDown(); // Loops back to 0
    expect(list.getSelectedIndex()).toBe(0);
  });

  it("renders suggestion box with active highlight", () => {
    list.setItems([
      { value: "/cost", label: "/cost", description: "Cost telemetry" },
    ]);

    const rendered = list.render(60);
    expect(rendered.length).toBeGreaterThanOrEqual(3);
    expect(rendered[1]).toContain("/cost");
    expect(rendered[1]).toContain("Cost telemetry");
  });
});
