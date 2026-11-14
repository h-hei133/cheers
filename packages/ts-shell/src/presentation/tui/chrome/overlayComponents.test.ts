import { afterEach, describe, expect, it, vi } from "vitest";
import { parseKeyEvent } from "../input/keys.js";
import { OverlayStack } from "../render/overlayStack.js";
import { fuzzyFilter, fuzzyMatch } from "../text/search.js";
import { CancellableLoader, SingleLineInput, wrapOverlayBox } from "./overlayWidgets.js";
import { OptionModel } from "./options.js";
import { SelectList } from "./selectList.js";
import { SettingsList, type SettingItem } from "./settingsList.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("Pi fuzzyMatch and fuzzyFilter", () => {
  it("supports multi-token queries, contiguous preference, and alphanumeric swaps", () => {
    expect(fuzzyMatch("4o", "gpt-o4-mini").matches).toBe(true);
    expect(fuzzyMatch("o4", "gpt-4o").matches).toBe(true);

    const items = [
      "openrouter/openrouter/gpt-4",
      "openrouter/anthropic/claude-opus-4",
      "openai/gpt-4o",
    ];
    const filtered = fuzzyFilter(items, "anthropic opus", (x) => x);
    expect(filtered).toEqual(["openrouter/anthropic/claude-opus-4"]);

    const model = new OptionModel();
    model.setOptions([
      { id: "a", label: "gpt-4o", detail: "openai" },
      { id: "b", label: "claude-opus-4", detail: "anthropic" },
    ]);
    model.setFilter("anth opus");
    expect(model.visible.map((o) => o.id)).toEqual(["b"]);
  });
});

describe("SelectList OverlayComponent", () => {
  it("filters fuzzily, wraps keyboard navigation, and routes pointer wheel/click", () => {
    const list = new SelectList(
      [
        { value: "alpha", label: "Alpha", description: "First item" },
        { value: "beta", label: "Beta", description: "Second item" },
        { value: "gamma", label: "Gamma", description: "Third item" },
      ],
      2,
    );
    const onSelect = vi.fn();
    list.onSelect = onSelect;

    list.handleKey(parseKeyEvent("\x1b[A")); // up wraps to Gamma
    expect(list.getSelectedItem()?.value).toBe("gamma");

    list.handlePointer(
      { kind: "wheel", button: -1, row: 0, column: 0, shift: false, alt: false, ctrl: false },
      { row: 0, col: 0, width: 50, height: 3 },
    );
    expect(list.getSelectedItem()?.value).toBe("beta");

    list.handleKey(parseKeyEvent("\r"));
    expect(onSelect).toHaveBeenCalledWith({ value: "beta", label: "Beta", description: "Second item" });

    list.setFilter("alp");
    expect(list.render(50)[0]).toContain("Alpha");
  });
});

describe("SettingsList OverlayComponent", () => {
  it("cycles inline values, filters with live search, and restores cursor after submenu", () => {
    const items: SettingItem[] = [
      { id: "theme", label: "Theme", currentValue: "dark", values: ["dark", "light"] },
      {
        id: "model",
        label: "Model",
        currentValue: "sonnet",
        submenu: (_cur, done) => {
          const sub = new SelectList([{ value: "opus", label: "Opus" }]);
          sub.onSelect = (picked) => done(picked.value);
          sub.onCancel = () => done(undefined);
          return sub;
        },
      },
    ];
    const onChange = vi.fn();
    const onCancel = vi.fn();
    const settings = new SettingsList(items, onChange, onCancel, { enableSearch: true });

    // Enter cycles first item dark -> light
    settings.handleKey(parseKeyEvent("\r"));
    expect(onChange).toHaveBeenCalledWith("theme", "light");

    // Move down to Model, open submenu, select Opus, restore cursor on Model
    settings.handleKey(parseKeyEvent("\x1b[B"));
    settings.handleKey(parseKeyEvent("\r"));
    expect(settings.render(40)[0]).toContain("Opus");
    settings.handleKey(parseKeyEvent("\r"));
    expect(onChange).toHaveBeenCalledWith("model", "opus");
    expect(settings.render(40).some((line) => line.includes("Model"))).toBe(true);

    // Search filters down to Theme
    settings.handleKey(parseKeyEvent("t"));
    settings.handleKey(parseKeyEvent("h"));
    settings.handleKey(parseKeyEvent("e"));
    expect(settings.render(40).some((line) => line.includes("Model"))).toBe(false);

    // Escape clears search first, second Escape calls onCancel
    settings.handleKey(parseKeyEvent("\x1b"));
    expect(onCancel).not.toHaveBeenCalled();
    settings.handleKey(parseKeyEvent("\x1b"));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});

describe("SingleLineInput, CancellableLoader, and OverlayStack composition", () => {
  it("supports editing, paste, loader abort/dispose, and compositing inside OverlayStack", () => {
    vi.useFakeTimers();
    const input = new SingleLineInput("Type...");
    const submitted = vi.fn();
    input.onSubmit = submitted;
    input.handleKey(parseKeyEvent("a"));
    input.handlePaste("bc\ndef");
    input.handleKey(parseKeyEvent("\r"));
    expect(submitted).toHaveBeenCalledWith("abc def");

    const gInput = new SingleLineInput();
    gInput.focused = true;
    gInput.handlePaste("e\u0301😀z");
    gInput.handleKey(parseKeyEvent("\x1b[D"));
    gInput.handleKey(parseKeyEvent("\x1b[D"));
    expect(gInput.render(20)[0]).toContain("e\u0301\x1b_c\x07😀z");
    gInput.handleKey(parseKeyEvent("\x7f"));
    expect(gInput.getValue()).toBe("😀z");
    const tick = vi.fn();
    const aborted = vi.fn();
    const loader = new CancellableLoader("Loading data", tick);
    loader.onAbort = aborted;

    const stack = new OverlayStack();
    const handle = stack.push(loader, { width: 30, anchor: "center" });
    vi.advanceTimersByTime(160);
    expect(tick).toHaveBeenCalled();

    const frame = stack.composite(Array.from({ length: 10 }, () => ".".repeat(40)), 40, 10);
    expect(frame.some((row) => row.includes("Loading data"))).toBe(true);

    stack.handleKey(parseKeyEvent("\x1b"));
    expect(loader.aborted).toBe(true);
    expect(aborted).toHaveBeenCalledOnce();
    handle.hide();
    loader.dispose();

    const boxed = wrapOverlayBox(["content"], 20, "Title", "Footer");
    expect(boxed[0]).toContain("Title");
    expect(boxed[2]).toContain("Footer");
  });
});
