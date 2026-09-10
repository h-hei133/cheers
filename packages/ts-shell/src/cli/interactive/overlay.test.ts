import { describe, expect, it, vi } from "vitest";
import { OverlayHost, type Picker } from "./overlay.js";
import { parseKeyEvent } from "../../presentation/tui/input/keys.js";
import type { Option } from "../../presentation/tui/chrome/options.js";

const options: Option[] = [
  { id: "a", label: "alpha" },
  { id: "b", label: "beta", selected: true },
];

function picker(overrides: Partial<Picker> = {}): Picker {
  return {
    title: "Pick",
    form: "panel",
    empty: "none",
    load: async () => options,
    apply: async () => undefined,
    ...overrides,
  };
}

function host(): { overlay: OverlayHost; changes: () => number } {
  let changes = 0;
  return { overlay: new OverlayHost(() => (changes += 1)), changes: () => changes };
}

const press = (overlay: OverlayHost, data: string, apply = vi.fn()): boolean =>
  overlay.handleKey(parseKeyEvent(data), apply);

describe("lifecycle", () => {
  it("is inactive until a picker opens", () => {
    const { overlay } = host();
    expect(overlay.active).toBe(false);
    overlay.open(picker());
    expect(overlay.active).toBe(true);
  });

  it("reports whether the open picker wants the whole screen", () => {
    const { overlay } = host();
    overlay.open(picker());
    expect(overlay.fullScreen).toBe(false);
    overlay.open(picker({ form: "modal" }));
    expect(overlay.fullScreen).toBe(true);
  });

  it("shows a loading state until the options arrive", async () => {
    const { overlay } = host();
    let release: (value: readonly Option[]) => void = () => {};
    overlay.open(picker({ load: () => new Promise((resolve) => (release = resolve)) }));
    expect(overlay.render(60, 20).join("\n")).toContain("loading");
    release(options);
    await Promise.resolve();
    await Promise.resolve();
    expect(overlay.render(60, 20).join("\n")).toContain("alpha");
  });

  it("survives a picker whose load fails", async () => {
    // A failed load leaves the picker open and empty rather than tearing down
    // the frame; the user can still press escape.
    const { overlay } = host();
    overlay.open(picker({ load: () => Promise.reject(new Error("no")) }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(overlay.active).toBe(true);
    expect(overlay.render(60, 20).join("\n")).toContain("none");
  });

  it("renders nothing when closed", () => {
    const { overlay } = host();
    expect(overlay.render(60, 20)).toEqual([]);
  });
});

describe("key routing", () => {
  it("claims every key while open, so nothing leaks to the prompt", async () => {
    const { overlay } = host();
    overlay.open(picker());
    await Promise.resolve();
    for (const key of ["\x1b[A", "\x1b[B", "x", "\r", "\x7f"]) {
      const fresh = host();
      fresh.overlay.open(picker());
      expect(press(fresh.overlay, key)).toBe(true);
    }
  });

  it("claims no key while closed", () => {
    const { overlay } = host();
    expect(press(overlay, "x")).toBe(false);
  });

  it("closes on escape without applying", () => {
    const { overlay } = host();
    const apply = vi.fn();
    overlay.open(picker());
    press(overlay, "\x1b", apply);
    expect(overlay.active).toBe(false);
    expect(apply).not.toHaveBeenCalled();
  });

  it("types into the filter", async () => {
    const { overlay } = host();
    overlay.open(picker());
    await Promise.resolve();
    await Promise.resolve();
    press(overlay, "b");
    const rows = overlay.render(60, 20).join("\n");
    expect(rows).toContain("beta");
    expect(rows).not.toContain("alpha");
  });
});

describe("accepting", () => {
  it("applies the row under the cursor and closes", async () => {
    const { overlay } = host();
    const apply = vi.fn();
    overlay.open(picker());
    await Promise.resolve();
    await Promise.resolve();
    press(overlay, "\r", apply);
    expect(apply).toHaveBeenCalledWith(expect.objectContaining({ title: "Pick" }), ["a"]);
    expect(overlay.active).toBe(false);
  });

  it("applies nothing when there is no row to apply", () => {
    const { overlay } = host();
    const apply = vi.fn();
    overlay.open(picker({ load: async () => [] }));
    press(overlay, "\r", apply);
    expect(apply).not.toHaveBeenCalled();
  });

  it("treats space as a toggle only for a multi-answer picker", async () => {
    const { overlay } = host();
    const apply = vi.fn();
    overlay.open(picker({ multiple: true }));
    await Promise.resolve();
    await Promise.resolve();
    press(overlay, " ");
    press(overlay, "\r", apply);
    expect(apply).toHaveBeenCalledWith(expect.anything(), ["a", "b"]);
  });

  it("applies an empty set from a multi-answer picker, which is a real choice", async () => {
    const { overlay } = host();
    const apply = vi.fn();
    overlay.open(picker({ multiple: true }));
    await Promise.resolve();
    await Promise.resolve();
    press(overlay, "\x1b[B");
    press(overlay, " ");
    press(overlay, "\r", apply);
    expect(apply).toHaveBeenCalledWith(expect.anything(), []);
  });
});

describe("approval picker key routing", () => {
  function approvalPicker(): Picker {
    return {
      title: "Permission",
      form: "panel",
      empty: "none",
      load: async () => [
        { id: "allow-once", label: "Allow once" },
        { id: "allow-always", label: "Allow always" },
        { id: "deny", label: "Deny" },
      ],
      apply: async () => undefined,
    };
  }

  it("selects allow-once directly on pressing y or 1", async () => {
    const { overlay } = host();
    const apply = vi.fn();
    overlay.open(approvalPicker());
    await Promise.resolve();
    await Promise.resolve();
    press(overlay, "y", apply);
    expect(apply).toHaveBeenCalledWith(expect.anything(), ["allow-once"]);
    expect(overlay.active).toBe(false);
  });

  it("selects allow-always directly on pressing a or 2", async () => {
    const { overlay } = host();
    const apply = vi.fn();
    overlay.open(approvalPicker());
    await Promise.resolve();
    await Promise.resolve();
    press(overlay, "a", apply);
    expect(apply).toHaveBeenCalledWith(expect.anything(), ["allow-always"]);
    expect(overlay.active).toBe(false);
  });

  it("selects deny directly on pressing n, d, or 3", async () => {
    for (const key of ["n", "d", "3"]) {
      const { overlay } = host();
      const apply = vi.fn();
      overlay.open(approvalPicker());
      await Promise.resolve();
      await Promise.resolve();
      press(overlay, key, apply);
      expect(apply).toHaveBeenCalledWith(expect.anything(), ["deny"]);
      expect(overlay.active).toBe(false);
    }
  });

  it("supports navigation with down arrow and enter", async () => {
    const { overlay } = host();
    const apply = vi.fn();
    overlay.open(approvalPicker());
    await Promise.resolve();
    await Promise.resolve();
    press(overlay, "\x1b[B");
    press(overlay, "\r", apply);
    expect(apply).toHaveBeenCalledWith(expect.anything(), ["allow-always"]);
    expect(overlay.active).toBe(false);
  });

  it("supports j and k navigation without filtering options", async () => {
    const { overlay } = host();
    const apply = vi.fn();
    overlay.open(approvalPicker());
    await Promise.resolve();
    await Promise.resolve();
    press(overlay, "j");
    press(overlay, "j");
    press(overlay, "\r", apply);
    expect(apply).toHaveBeenCalledWith(expect.anything(), ["deny"]);
  });

  it("absorbs arbitrary typing without shrinking approval choices", async () => {
    const { overlay } = host();
    overlay.open(approvalPicker());
    await Promise.resolve();
    await Promise.resolve();
    press(overlay, "x");
    const rows = overlay.render(60, 20);
    expect(rows.join("\n")).toContain("Allow once");
    expect(rows.join("\n")).toContain("Deny");
  });

  it("absorbs typing on a non-filterable approval picker without showing a filter", async () => {
    const { overlay } = host();
    overlay.open({
      title: "Permission: test",
      form: "panel",
      empty: "none",
      filterable: false,
      load: async () => [
        { id: "allow-once", label: "Allow once", note: "1 / y" },
        { id: "deny", label: "Deny", note: "3 / n" },
      ],
      apply: async () => undefined,
    });
    await Promise.resolve();
    await Promise.resolve();
    press(overlay, "x");
    const rows = overlay.render(60, 20);
    // The shortcut hints stay on the right; no typed filter text appears.
    expect(rows.join("\n")).toContain("1 / y");
    expect(rows.join("\n")).not.toContain("x");
    const apply = vi.fn();
    press(overlay, "1", apply);
    expect(apply).toHaveBeenCalledWith(expect.anything(), ["allow-once"]);
  });

  it("transitions to deny-reason sub-mode when onDeny is present and submits with reason", async () => {
    const { overlay } = host();
    const apply = vi.fn();
    const onDeny = vi.fn();
    overlay.open({
      ...approvalPicker(),
      onDeny,
    });
    await Promise.resolve();
    await Promise.resolve();
    press(overlay, "3");
    expect(overlay.active).toBe(true);
    const rows = overlay.render(60, 20);
    expect(rows.join("\n")).toContain("Explain why this was denied");
    for (const ch of "not safe") press(overlay, ch);
    press(overlay, "\r", apply);
    expect(onDeny).toHaveBeenCalledWith("not safe");
    expect(overlay.active).toBe(false);
  });

  it("denies without reason on Enter with empty input in deny-reason sub-mode", async () => {
    const { overlay } = host();
    const apply = vi.fn();
    const onDeny = vi.fn();
    overlay.open({
      ...approvalPicker(),
      onDeny,
    });
    await Promise.resolve();
    await Promise.resolve();
    press(overlay, "n");
    expect(overlay.active).toBe(true);
    press(overlay, "\r", apply);
    expect(onDeny).toHaveBeenCalledWith(undefined);
    expect(overlay.active).toBe(false);
  });

  it("denies without reason on Escape in deny-reason sub-mode", async () => {
    const { overlay } = host();
    const apply = vi.fn();
    const onDeny = vi.fn();
    overlay.open({
      ...approvalPicker(),
      onDeny,
    });
    await Promise.resolve();
    await Promise.resolve();
    press(overlay, "d");
    expect(overlay.active).toBe(true);
    press(overlay, "\x1b", apply);
    expect(onDeny).toHaveBeenCalledWith(undefined);
    expect(overlay.active).toBe(false);
  });

  it("denies directly without reason on Escape from the main approval menu", async () => {
    const { overlay } = host();
    const apply = vi.fn();
    const onDeny = vi.fn();
    overlay.open({
      ...approvalPicker(),
      onDeny,
    });
    await Promise.resolve();
    await Promise.resolve();
    press(overlay, "\x1b", apply);
    expect(onDeny).toHaveBeenCalledWith(undefined);
    expect(overlay.active).toBe(false);
  });
  it("calls previewEnd when an empty selection is accepted", () => {
    const { overlay } = host();
    const apply = vi.fn();
    const previewEnd = vi.fn();
    overlay.open({
      title: "Empty picker",
      form: "panel",
      empty: "none",
      load: async () => [],
      apply: async () => undefined,
      previewEnd,
    });
    press(overlay, "\r", apply);
    expect(apply).not.toHaveBeenCalled();
    expect(previewEnd).toHaveBeenCalledOnce();
  });

  it("dismisses approval picker on ctrl+c and triggers previewEnd", async () => {
    const { overlay } = host();
    const apply = vi.fn();
    const previewEnd = vi.fn();
    overlay.open({ ...approvalPicker(), previewEnd });
    await Promise.resolve();
    await Promise.resolve();
    expect(overlay.active).toBe(true);
    press(overlay, "\x03", apply);
    expect(overlay.active).toBe(false);
    expect(apply).not.toHaveBeenCalled();
    expect(previewEnd).toHaveBeenCalledOnce();
  });

  it("selects directly on numeric keyId without text", async () => {
    const { overlay } = host();
    const apply = vi.fn();
    overlay.open(approvalPicker());
    await Promise.resolve();
    await Promise.resolve();
    overlay.handleKey(
      { keyId: "2", raw: "2", ctrl: false, alt: false, shift: false, text: "" },
      apply,
    );
    expect(apply).toHaveBeenCalledWith(expect.anything(), ["allow-always"]);
    expect(overlay.active).toBe(false);
  });

  it("dismisses approval picker on escape and triggers previewEnd", async () => {
    const { overlay } = host();
    const apply = vi.fn();
    const previewEnd = vi.fn();
    overlay.open({ ...approvalPicker(), previewEnd });
    await Promise.resolve();
    await Promise.resolve();
    expect(overlay.active).toBe(true);
    press(overlay, "\x1b", apply);
    expect(overlay.active).toBe(false);
    expect(apply).not.toHaveBeenCalled();
    expect(previewEnd).toHaveBeenCalledOnce();
  });

  it("supports up arrow navigation and enter acceptance", async () => {
    const { overlay } = host();
    const apply = vi.fn();
    overlay.open(approvalPicker());
    await Promise.resolve();
    await Promise.resolve();
    // Start at index 0 (allow-once). Press up arrow -> wraps to index 2 (deny).
    press(overlay, "\x1b[A");
    press(overlay, "\r", apply);
    expect(apply).toHaveBeenCalledWith(expect.anything(), ["deny"]);
    expect(overlay.active).toBe(false);
  });

  it("omits the count in the approval header row", async () => {
    const { overlay } = host();
    overlay.open(approvalPicker());
    await Promise.resolve();
    await Promise.resolve();
    const rows = overlay.render(80, 10);
    // Header row should have the title, but not the floating count '3' on the right
    const header = rows[0]!;
    expect(header).toContain("Permission");
    expect(header.trimEnd().endsWith("3")).toBe(false);
  });
});
