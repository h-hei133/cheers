import { describe, expect, it, vi } from "vitest";
import { runCliStdinMode } from "../cli/print/stdinBatchModeRunner.js";

describe("CLI stdin mode runner", () => {
  it("does not consume the rest of a batch after an exit action", async () => {
    const runPrompt = vi.fn(async () => "exit" as const);
    await runCliStdinMode({
      mode: "batch", prompts: ["/exit", "must not run"], pipedInput: null,
      sessionId: "exit-session", renderLine: vi.fn(), runPrompt,
    });
    expect(runPrompt.mock.calls).toEqual([["/exit"]]);
  });
  it("delegates live stdin stream mode to the existing stream runner", async () => {
    const runStream = vi.fn(async () => {});

    await runCliStdinMode({
      mode: "stream-live",
      runStream,
    });

    expect(runStream).toHaveBeenCalledTimes(1);
  });

  it("returns without running prompts for an empty batch", async () => {
    const runPrompt = vi.fn();
    const renderLine = vi.fn();

    await runCliStdinMode({
      mode: "batch",
      prompts: [],
      pipedInput: "",
      sessionId: "sess_empty",
      renderLine,
      runPrompt,
    });

    expect(renderLine).not.toHaveBeenCalled();
    expect(runPrompt).not.toHaveBeenCalled();
  });

  it("renders the batch marker and runs piped prompts sequentially", async () => {
    const seen: string[] = [];
    const renderLine = vi.fn();

    await runCliStdinMode({
      mode: "batch",
      prompts: ["first", "second"],
      pipedInput: "first\nsecond\n",
      sessionId: "sess_batch",
      renderLine,
      runPrompt: async (prompt) => {
        seen.push(prompt);
      },
    });

    expect(renderLine).toHaveBeenCalledWith(
      "Stdin batch mode: running 2 prompt(s) sequentially in session sess_batch.",
    );
    expect(seen).toEqual(["first", "second"]);
  });
});
