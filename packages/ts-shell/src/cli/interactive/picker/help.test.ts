import { describe, expect, it, vi } from "vitest";
import { listSlashInvocations, registerSlashCommand } from "../../../entrypoints/slashCommandRegistry.js";
import * as configuration from "../../../config/runtimeConfig.js";
import { OptionModel } from "../../../presentation/tui/chrome/options.js";
import { parseKeyEvent } from "../../../presentation/tui/input/keys.js";
import { stripAnsi } from "../../../presentation/tui/text/ansi.js";
import { OverlayHost } from "../overlay.js";
import { helpPicker } from "./help.js";
import { opensPicker, pickerFor, type PickerHost } from "./registry.js";

describe("command guide", () => {
  it("projects the shared inventory and matches aliases without duplicate choices", async () => {
    const options = await helpPicker().load();
    expect(options.map(option => option.id)).toEqual(listSlashInvocations().filter(item => item.kind !== "alias").map(item => item.invocation));
    expect(options.find(option => option.id === "/back")?.note).toBe("session · interactive");
    const model = new OptionModel(); model.setOptions(options); model.setFilter("/models");
    expect(model.visible.map(option => option.id)).toEqual(["/model"]);
    expect(await helpPicker().apply(["/model"])).toEqual({ draft: "/model " });
    expect(await helpPicker().apply(["/recall"])).toEqual({ draft: "/recall " });
    expect(await helpPicker().apply(["/exit"])).toEqual({ draft: "/exit " });
    for (const name of ["/help", "/?"]) {
      expect(opensPicker(name)).toBe(true);
      expect(pickerFor(name, {} as PickerHost)?.title).toBe("Slash commands");
    }
    expect(opensPicker("/help extra")).toBe(false);
  });

  it("respects the registry's MCP gate", async () => {
    const current = configuration.getRuntimeConfig();
    const read = vi.spyOn(configuration, "getRuntimeConfig").mockReturnValue({ ...current, enableMcpTools: false });
    try { expect((await helpPicker().load()).some(option => option.id === "/mcp")).toBe(false); }
    finally { read.mockRestore(); }
  });

  it("updates open guides on extension changes and releases subscriptions on close", async () => {
    const changed = vi.fn(); const overlay = new OverlayHost(changed); const picker = helpPicker();
    overlay.open(picker);
    await new Promise(resolve => setTimeout(resolve, 0));
    overlay.handlePaste("/guide-alias");
    expect(stripAnsi(overlay.render(100, 24).join("\n"))).toContain("No matching commands");
    const remove = registerSlashCommand({ name: "guide-fixture", aliases: ["guide-alias"], group: "workflow", summary: "A dynamic command" });
    try {
      expect(stripAnsi(overlay.render(100, 24).join("\n"))).toContain("/guide-fixture");
      const apply = vi.fn(); overlay.handleKey(parseKeyEvent("\r"), apply);
      expect(apply).toHaveBeenCalledWith(picker, ["/guide-fixture"]);
      changed.mockClear(); remove(); expect(changed).not.toHaveBeenCalled();
      expect(await picker.apply(["/guide-fixture"])).toBeUndefined();
    } finally { remove(); overlay.close(); }
  });
});
