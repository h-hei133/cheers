import { describe, it, expect } from "vitest";
import { getSlashCommandSuggestions } from "./slashAutocomplete.js";

describe("Tiered Fuzzy Slash Command Matcher", () => {
  it("matches by exact prefix", () => {
    const res = getSlashCommandSuggestions("/mod");
    expect(res).not.toBeNull();
    expect(res![0].name).toBe("/model");
  });

  it("matches by non-prefix substring (e.g. 'ost' or 'st' matches /cost)", () => {
    const res = getSlashCommandSuggestions("/st");
    expect(res).not.toBeNull();
    expect(res!.some((c) => c.name === "/cost" || c.name === "/fast")).toBe(true);
  });

  it("matches by subsequence fuzzy match (e.g. 'un' or 'do' matches /undo)", () => {
    const res = getSlashCommandSuggestions("/do");
    expect(res).not.toBeNull();
    expect(res!.some((c) => c.name === "/undo" || c.name === "/doctor")).toBe(true);
  });
});
