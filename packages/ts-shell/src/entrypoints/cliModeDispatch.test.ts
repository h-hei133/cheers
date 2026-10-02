import { describe, expect, it } from "vitest";
import { resolveCliMode } from "./cliModeDispatch.js";

describe("CLI mode dispatch", () => {
  it.each(["disabled", "capture-batch", "stream-live"] as const)("selects non-interactive JSON output with %s stdin", (stdinTransportMode) => {
    expect(resolveCliMode({
      options: { jsonEvents: true }, stdinTransportMode, nonInteractivePromptCount: 0,
    })).toEqual({ kind: "print" });
  });
  it("preserves replay precedence over stdin, print, and prompt batch modes", () => {
    expect(
      resolveCliMode({
        options: {
          replayFile: "replay.txt",
          printMode: true,
          promptArg: "ignored",
        },
        stdinTransportMode: "stream-live",
        nonInteractivePromptCount: 2,
      }),
    ).toEqual({ kind: "replay", replayFile: "replay.txt" });
  });

  it("selects live stdin stream before print or batch fallback when requested", () => {
    expect(
      resolveCliMode({
        options: {},
        stdinTransportMode: "stream-live",
        nonInteractivePromptCount: 0,
      }),
    ).toEqual({ kind: "stdin-stream" });
  });

  it("selects print mode even when no prompt has been materialized", () => {
    expect(
      resolveCliMode({
        options: { printMode: true },
        stdinTransportMode: "disabled",
        nonInteractivePromptCount: 0,
      }),
    ).toEqual({ kind: "print" });
  });

  it("selects stdin batch when non-interactive prompts are present", () => {
    expect(
      resolveCliMode({
        options: {},
        stdinTransportMode: "capture-batch",
        nonInteractivePromptCount: 2,
      }),
    ).toEqual({ kind: "stdin-batch" });
  });

  it("falls back to interactive mode when no non-interactive mode is active", () => {
    expect(
      resolveCliMode({
        options: {},
        stdinTransportMode: "disabled",
        nonInteractivePromptCount: 0,
      }),
    ).toEqual({ kind: "interactive" });
  });
});
