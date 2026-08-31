import { describe, it, expect } from "vitest";
import {
  getSlashCommandSuggestions,
  renderSlashAutocompleteMenu,
} from "./slashAutocomplete.js";

describe("Slash Command Autocomplete", () => {
  it("matches slash command prefix accurately", () => {
    const helpMatch = getSlashCommandSuggestions("/he");
    expect(helpMatch).not.toBeNull();
    expect(helpMatch!.some((c) => c.name === "/help")).toBe(true);

    const modelMatch = getSlashCommandSuggestions("/mod");
    expect(modelMatch).not.toBeNull();
    expect(modelMatch![0].name).toBe("/model");
  });

  it("returns null for non-slash inputs or inputs with arguments", () => {
    expect(getSlashCommandSuggestions("hello world")).toBeNull();
    expect(getSlashCommandSuggestions("/model gpt-4o")).toBeNull();
  });

  it("renders floating autocomplete menu correctly", () => {
    const suggestions = [
      { name: "/help", description: "Show help" },
      { name: "/model", description: "Switch model" },
    ];
    const menu = renderSlashAutocompleteMenu(suggestions, 0, 50);

    expect(menu.length).toBeGreaterThanOrEqual(3);
    expect(menu[0]).toContain("Commands");
    expect(menu[1]).toContain("/help");
    expect(menu[2]).toContain("/model");
  });
});
