import { describe, expect, it } from "vitest";
import { settingsPicker, type SettingsHost } from "./settings.js";

/** A host that records what saving was asked to write. */
function host(overrides: Partial<SettingsHost> = {}): SettingsHost & { saved: Map<string, boolean> } {
  const saved = new Map<string, boolean>();
  const base: SettingsHost = {
    readSetting: (key) => saved.get(key) ?? false,
    saveSetting: async (key, value) => {
      saved.set(key, value);
    },
    ...overrides,
  };
  return Object.assign(base, { saved });
}

describe("settings picker", () => {
  it("offers the toggles with their current values marked", async () => {
    const h = host({ readSetting: (key) => key === "attentionOnIdle" });
    const picker = settingsPicker(h);
    const options = await picker.load();

    // Each toggle appears once per state it can take, with the live one
    // selected — the same shape the model and statusline pickers use.
    expect(options.length).toBeGreaterThanOrEqual(4);
    const on = options.find((option) => option.id === "attentionOnIdle:true");
    const off = options.find((option) => option.id === "attentionOnIdle:false");
    expect(on?.selected).toBe(true);
    expect(off?.selected).toBe(false);
  });

  it("writes the chosen value and reports it as a note", async () => {
    const h = host();
    const picker = settingsPicker(h);
    const outcome = await picker.apply(["attentionOnIdle:true"]);
    expect(h.saved.get("attentionOnIdle")).toBe(true);
    // The note speaks the label the panel shows, not the field the file holds.
    expect(outcome?.note).toContain("Attention on idle");
  });
});
