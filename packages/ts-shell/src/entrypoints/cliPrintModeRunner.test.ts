import { describe, expect, it, vi } from "vitest";
import { runCliPrintMode } from "../cli/print/printModeRunner.js";

describe("CLI print mode runner", () => {
  it("preserves the missing-prompt error and exit behavior", async () => {
    const writeError = vi.fn();
    const runPrompt = vi.fn();
    const exit = vi.fn((code: number): never => {
      throw new Error(`exit:${code}`);
    });

    await expect(
      runCliPrintMode({
        prompts: [],
        writeError,
        exit,
        runPrompt,
      }),
    ).rejects.toThrow("exit:1");

    expect(writeError).toHaveBeenCalledWith(
      "No prompt provided for --print mode. Pass a prompt argument or pipe stdin.",
    );
    expect(exit).toHaveBeenCalledWith(1);
    expect(runPrompt).not.toHaveBeenCalled();
  });

  it("runs materialized print prompts sequentially", async () => {
    const seen: string[] = [];

    await runCliPrintMode({
      prompts: ["first", "second"],
      writeError: vi.fn(),
      exit: vi.fn((code: number): never => {
        throw new Error(`unexpected exit:${code}`);
      }),
      runPrompt: async (prompt) => {
        seen.push(prompt);
      },
    });

    expect(seen).toEqual(["first", "second"]);
  });
});
