import { describe, expect, it } from "vitest";
import { slashArgumentHint, slashSuggestions } from "./slashSuggestions.js";
import { listSlashInvocations, getSlashCommand, registerSlashCommand } from "../../entrypoints/slashCommandRegistry.js";

describe("command completions", () => {
  it.each([
    ["/continue ", "[sess_<id>] [prompt]"], ["/c ", "[sess_<id>] [prompt]"],
    ["/review ", "[focus]"], ["/cp ", "[text]"], ["/commit ", "[guidance]"],
    ["/ask ", "<question>"], ["/recall ", "<query>"],
    ["/retain ", "<statement>"],
  ])("shows usage without selectable placeholders for %s", (text, hint) => {
    expect(slashSuggestions(text)).toBeNull();
    expect(slashArgumentHint({ text, cursor: text.length, revision: 1 })).toBe(`Usage: ${text}${hint}`);
  });

  it.each(["deep-research", "research", "deep"])("offers research controls and keeps the question informational for /%s", (name) => {
    const text = `/${name} `;
    expect(slashSuggestions(text)?.map(item => item.value)).toEqual([
      "status", "dump", "pause", "resume", "steer", "reconcile",
    ]);
    expect(slashSuggestions(`${text}a software question`)).toBeNull();
    expect(slashArgumentHint({ text, cursor: text.length, revision: 1 })).toContain("question");
  });

  it.each(["/help ", "/qui ", "plain text", "/usr/local/bin "])("does not invent argument usage for %s", text => {
    expect(slashArgumentHint({ text, cursor: text.length, revision: 1 })).toBeUndefined();
  });

  it("offers nothing for ordinary prose", () => {
    expect(slashSuggestions("how do I build this")).toBeNull();
  });

  it("offers each distinct invocation without synonymous aliases for a bare slash", () => {
    const names = new Set(listSlashInvocations().filter(invocation => invocation.kind !== "alias").map(invocation => invocation.name));
    expect(slashSuggestions("/")).toHaveLength(names.size);
  });

  it("only offers known command invocations", () => {
    // A hand-maintained list drifts and ends up advertising commands that fail.
    for (const suggestion of slashSuggestions("/") ?? []) {
      expect(getSlashCommand(suggestion.value)).toBeDefined();
    }
  });

  it("ranks the typed prefix first", () => {
    expect(slashSuggestions("/mod")?.[0]?.value).toBe("/model");
  });

  it("completes aliases and resolves their argument candidates through the registry", () => {
    expect(slashSuggestions("/qu")?.[0]?.value).toBe("/quit");
    expect(slashSuggestions("/qu")?.[0]?.detail).toContain("alias of /exit");
    expect(slashSuggestions("/where re")?.map(item => item.value)).toEqual(slashSuggestions("/workspace re")?.map(item => item.value));
    expect(slashSuggestions("/WHERE rece")?.[0]?.value).toBe("recent");
  });

  it("invalidates cached names and aliases when an extension is removed", () => {
    slashSuggestions("/");
    const remove = registerSlashCommand({
      name: "sample-command", aliases: ["sample-alias", "sample-alias"],
      group: "workflow", summary: "temporary command",
      getArgumentCompletions: () => [{ value: "item", label: "item" }],
    });
    try {
      expect(slashSuggestions("/sample-alias")?.filter((entry) => entry.value === "/sample-alias")).toHaveLength(1);
      expect(slashSuggestions("/sample-alias ")?.[0]?.value).toBe("item");
    } finally {
      remove();
    }
    expect(slashSuggestions("/sample-alias")).toBeNull();
    expect(slashSuggestions("/sample-alias ")).toBeNull();
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

  it("leaves model entity lookup to the asynchronous surface", () => {
    expect(slashSuggestions("/model use anthropic/")).toBeNull();
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
      "inspect and switch active model [status|refresh|config|list [provider] [--refresh]|use <model-id> [--global] [--effort <low|medium|high|auto|off|none>]|preset [arguments...]|help]",
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
      "inspect or set reasoning effort for the next turn [low|medium|high|off] [--global]",
    );
  });

  it("hints goal arguments", () => {
    const detail = slashSuggestions("/goal")?.[0]?.detail;
    expect(detail).toContain("[objective...]");
    expect(detail).toContain("pause");
    expect(detail).toContain("complete");
  });

  it("offers statusline and names the grammar it actually accepts", () => {
    const matches = slashSuggestions("/statusline");
    expect(matches?.some((match) => match.value === "/statusline")).toBe(true);
    // The hint used to advertise `use <preset|item...>`, a form the command
    // never accepted — a presets feature does not exist. The grammar shown has
    // to be one the handler parses.
    expect(matches?.find((match) => match.value === "/statusline")?.detail).toContain("[list|use <item...>]");
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


it("preserves independent recall/retain invocations and does not borrow memory subcommands", () => {
  expect(slashSuggestions("/recall ")).toBeNull();
  expect(slashSuggestions("/retain ")).toBeNull();
  expect(slashSuggestions("/recall")?.[0]).toMatchObject({ value: "/recall", detail: "search retained memory facts <query>" });
  expect(slashSuggestions("/mem ")?.map(item => item.value)).toEqual(slashSuggestions("/memory ")?.map(item => item.value));
  expect(slashSuggestions("/quit")?.[0]?.value).toBe("/quit");
  expect(slashSuggestions("/")?.some(item => item.value === "/quit")).toBe(false);
  expect(slashSuggestions("/?")?.[0]?.value).toBe("/?");
});


it("refreshes default and filtered candidates for named extension invocations", () => {
  slashSuggestions("/");
  const remove = registerSlashCommand({ name: "fixture", aliases: ["fixture-alias"], invocations: [{ name: "fixture-special", summary: "separate action" }], group: "workflow", summary: "fixture" });
  try {
    expect(slashSuggestions("/")?.some(item => item.value === "/fixture-special")).toBe(true);
    expect(slashSuggestions("/fixture-alias")?.[0]?.value).toBe("/fixture-alias");
  } finally { remove(); }
  expect(slashSuggestions("/fixture-special")).toBeNull();
  expect(slashSuggestions("/")?.some(item => item.value.startsWith("/fixture"))).toBe(false);
});
