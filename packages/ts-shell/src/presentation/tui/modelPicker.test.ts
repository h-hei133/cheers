import { describe, it, expect, beforeEach } from "vitest";
import { ModelPicker } from "./modelPicker.js";

describe("Interactive ModelPicker Dropdown", () => {
  let picker: ModelPicker;

  beforeEach(() => {
    picker = new ModelPicker();
  });

  it("manages open/close state and navigates candidates", () => {
    expect(picker.isOpen()).toBe(false);

    picker.open();
    expect(picker.isOpen()).toBe(true);

    const first = picker.getSelectedModel();
    expect(first).toBeDefined();

    picker.moveDown();
    const second = picker.getSelectedModel();
    expect(second?.value).not.toBe(first?.value);

    picker.close();
    expect(picker.isOpen()).toBe(false);
  });

  it("renders dropdown menu when active", () => {
    picker.open();
    const menu = picker.render(60);
    expect(menu.length).toBeGreaterThanOrEqual(3);
    expect(menu[0]).toContain("Suggestions");
  });
});
