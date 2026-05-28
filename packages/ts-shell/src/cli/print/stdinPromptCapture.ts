import type { ReadStream } from "node:tty";
import {
  buildNonInteractivePrompts,
  resolveStdinTransportMode,
} from "../../core/shell/printPromptInput.js";
import type { StdinTransportMode } from "../../core/shell/printPromptInput.js";
import type { CliOptions } from "../options/cliOptions.js";
import {
  resolveCliMode,
  type CliModePlan,
} from "../../entrypoints/cliModeDispatch.js";

export interface CliStdinPromptCapture {
  readonly stdinTransportMode: StdinTransportMode;
  readonly pipedInput: string | null;
  readonly nonInteractivePrompts: readonly string[];
  readonly cliModePlan: CliModePlan;
}

export interface CaptureCliStdinPromptInput {
  readonly options: CliOptions;
  readonly stdin: ReadStream;
}

export async function captureCliStdinPrompts(
  input: CaptureCliStdinPromptInput,
): Promise<CliStdinPromptCapture> {
  const stdinTransportMode = resolveStdinTransportMode({
    stdinIsTty: Boolean(input.stdin.isTTY),
    printMode: Boolean(input.options.printMode),
    hasReplayFile: Boolean(input.options.replayFile),
    hasPromptArg: Boolean(input.options.promptArg?.trim()),
  });
  const pipedInput =
    stdinTransportMode === "capture-batch"
      ? await readStdinToEnd(input.stdin)
      : null;
  const nonInteractivePrompts = buildNonInteractivePrompts(
    input.options.promptArg,
    pipedInput,
  );
  const cliModePlan = resolveCliMode({
    options: input.options,
    stdinTransportMode,
    nonInteractivePromptCount: nonInteractivePrompts.length,
  });

  return {
    stdinTransportMode,
    pipedInput,
    nonInteractivePrompts,
    cliModePlan,
  };
}

export async function readStdinToEnd(
  stdin: ReadStream,
): Promise<string | null> {
  try {
    let content = "";
    stdin.setEncoding("utf8");
    for await (const chunk of stdin) {
      content += chunk;
    }
    return content.length > 0 ? content : "";
  } catch {
    return "";
  }
}
