import { describe, expect, it } from "vitest";
import { buildNonInteractivePrompts, parseTransportPrompts, resolveStdinTransportMode, isFenceLine, updateFenceState, opensMultilineLiteralPrompt } from "./printPromptInput.js";

describe("prompt transport boundaries", () => {
  it("keeps explicit prompt ordering and preserves comment-like user text", () => {
    expect(buildNonInteractivePrompts(" first ", "\uFEFFsecond\r\n\n # user text \r\nthird")).toEqual(["first", "second", "# user text", "third"]);
    expect(buildNonInteractivePrompts(undefined, null)).toEqual([]);
    expect(buildNonInteractivePrompts(" first ", " \n")).toEqual(["first"]);
    expect(parseTransportPrompts("\uFEFF# note\r\n hello \n# ignored", { allowComments: true })).toEqual(["hello"]);
  });

  it.each([
    { stdinIsTty: true, printMode: true, hasReplayFile: false, hasPromptArg: false, mode: "none" },
    { stdinIsTty: false, printMode: true, hasReplayFile: true, hasPromptArg: false, mode: "none" },
    { stdinIsTty: false, printMode: true, hasReplayFile: false, hasPromptArg: true, mode: "capture-batch" },
    { stdinIsTty: false, printMode: false, hasReplayFile: false, hasPromptArg: true, mode: "none" },
    { stdinIsTty: false, printMode: false, hasReplayFile: false, hasPromptArg: false, mode: "stream-live" },
  ])("selects $mode for the given input ownership", input => {
    expect(resolveStdinTransportMode(input)).toBe(input.mode);
  });

  it("keeps fenced multi-line input open until its matching delimiter", () => {
    expect(isFenceLine("  ```ts")).toBe(true);
    expect(isFenceLine("inline ``` quote")).toBe(false);
    expect(updateFenceState(false, "```ts")).toBe(true);
    expect(updateFenceState(true, "const value = 1;")).toBe(true);
    expect(updateFenceState(true, "```")).toBe(false);
    expect(updateFenceState(false, "```inline```")).toBe(false);
    expect(opensMultilineLiteralPrompt("Write notes.txt with exactly this content:")).toBe(true);
    expect(opensMultilineLiteralPrompt("Explain this code:")).toBe(false);
    expect(opensMultilineLiteralPrompt("Write exactly this content.")).toBe(false);
  });
});
