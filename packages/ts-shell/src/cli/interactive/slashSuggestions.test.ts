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

  it("stops offering once the user moves on to arguments", () => {
    expect(slashSuggestions("/model ")).toBeNull();
    expect(slashSuggestions("/model use x")).toBeNull();
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
});
