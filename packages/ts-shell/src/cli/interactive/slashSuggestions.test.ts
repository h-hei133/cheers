import { describe, expect, it } from "vitest";
import { slashSuggestions } from "./slashSuggestions.js";
import { listSlashCommands } from "../../entrypoints/slashCommandRegistry.js";

describe("command completions", () => {
  it("offers nothing for ordinary prose", () => {
    expect(slashSuggestions("how do I build this")).toBeNull();
  });

  it("offers every registered command for a bare slash", () => {
    expect(slashSuggestions("/")).toHaveLength(listSlashCommands().length);
  });

  it("only ever offers commands the router dispatches", () => {
    // A hand-maintained list drifts and ends up advertising commands that fail.
    const registered = new Set(listSlashCommands().map((command) => `/${command.name}`));
    for (const suggestion of slashSuggestions("/") ?? []) {
      expect(registered.has(suggestion.value)).toBe(true);
    }
  });

  it("ranks the typed prefix first", () => {
    expect(slashSuggestions("/mod")?.[0]?.value).toBe("/model");
  });

  it("offers argument completions once the command name is exact", () => {
    const matches = slashSuggestions("/thinking ");
    expect(matches).not.toBeNull();
    expect(matches?.some((match) => match.value === "low")).toBe(true);
    expect(matches?.some((match) => match.value === "medium")).toBe(true);
    expect(matches?.some((match) => match.value === "high")).toBe(true);
    expect(matches?.some((match) => match.value === "off")).toBe(true);
  });

  it("filters argument completions by prefix", () => {
    const matches = slashSuggestions("/thinking l");
    expect(matches).toHaveLength(1);
    expect(matches?.[0]?.value).toBe("low");
  });

  it("offers no argument completions for a command that has none", () => {
    expect(slashSuggestions("/exit ")).toBeNull();
    expect(slashSuggestions("/help ")).toBeNull();
  });

  it("offers model pairs after the use subcommand", () => {
    const matches = slashSuggestions("/model use anthropic/");
    expect(matches).not.toBeNull();
    expect(matches?.some((match) => match.value.startsWith("anthropic/"))).toBe(true);
  });

  it("offers the model subcommands before a target is typed", () => {
    const matches = slashSuggestions("/model u");
    expect(matches?.some((match) => match.value === "use")).toBe(true);
  });

  it("offers nothing when nothing matches", () => {
    expect(slashSuggestions("/zzzzzz")).toBeNull();
  });

  it("carries the command summary as the detail line", () => {
    expect(slashSuggestions("/diagnose")?.[0]?.detail).toBeTruthy();
  });

  it("surfaces argument hints for commands that take arguments", () => {
    const matches = slashSuggestions("/model");
    expect(matches?.some((match) => match.value === "/model")).toBe(true);
    expect(matches?.find((match) => match.value === "/model")?.detail).toBe(
      "inspect and switch active model use <provider/model>",
    );
    expect(slashSuggestions("/diagnose")?.[0]?.detail).not.toContain("<");
  });

  it("advertises every dispatchable command, including commit/tools/thinking", () => {
    const values = new Set(
      (slashSuggestions("/") ?? []).map((match) => match.value),
    );
    expect(values.has("/commit")).toBe(true);
    expect(values.has("/tools")).toBe(true);
    expect(values.has("/thinking")).toBe(true);
  });

  it("hints the thinking levels the router accepts", () => {
    expect(slashSuggestions("/thinking")?.[0]?.detail).toBe(
      "inspect or set reasoning effort for the next turn [low|medium|high|off]",
    );
  });

  it("hints goal arguments", () => {
    expect(slashSuggestions("/goal")?.[0]?.detail).toContain("<goal instruction>");
  });

  it("shows the picker-only statusline command", () => {
    const matches = slashSuggestions("/statusline");
    expect(matches?.some((match) => match.value === "/statusline")).toBe(true);
    expect(matches?.find((match) => match.value === "/statusline")?.detail).toContain("<preset|item...>");
  });

  it("completes subcommands for commands with an enumerable set", () => {
    const matches = slashSuggestions("/log t");
    expect(matches).toHaveLength(1);
    expect(matches?.[0]?.value).toBe("tail");
  });

  it("completes shell backends after the use subcommand", () => {
    const matches = slashSuggestions("/shell use p");
    expect(matches).not.toBeNull();
    expect(matches?.some((match) => match.value === "powershell")).toBe(true);
  });
});
