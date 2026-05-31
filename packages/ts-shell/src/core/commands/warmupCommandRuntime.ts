import {
  parseStartupWarmCommandArgs,
  StartupWarmCommandContractError,
} from "../context/startup/startupWarmCommandContract.js";
import { runStartupWarmCommand } from "../context/startup/startupWarmCommandRunner.js";
import { emitCommandResultToSidebar } from "./sidebarCommandEvents.js";
import type { CommandContext, LocalCommandResult } from "./types.js";

export async function runWarmupLocalCommand(
  args: string[],
  context: CommandContext,
): Promise<LocalCommandResult> {
  try {
    const request = parseStartupWarmCommandArgs(args);
    const result = await runStartupWarmCommand({
      request,
      projectRoot: context.cwd,
      cacheStore: context.startupWarmContextCacheStore,
      memoryStore: context.projectMemoryStore,
    });
    const localResult: LocalCommandResult = {
      kind: "local",
      output: result.output,
    };
    emitCommandResultToSidebar(context, {
      command: "/warmup",
      args,
      result: localResult,
    });
    return localResult;
  } catch (error) {
    const localResult: LocalCommandResult = {
      kind: "local",
      output: formatWarmupCommandError(error),
    };
    emitCommandResultToSidebar(context, {
      command: "/warmup",
      args,
      result: localResult,
    });
    return localResult;
  }
}

function formatWarmupCommandError(error: unknown): string {
  const reason = error instanceof Error ? error.message : "Unknown warmup command error.";
  const blocker =
    error instanceof StartupWarmCommandContractError
      ? error.code
      : "startup-warm-command-error";
  return [
    "Startup warm context",
    "Result",
    "- Outcome: blocked",
    `- BlockerKind: ${blocker}`,
    `- Reason: ${reason}`,
    "- Injected into model: no",
    "- Startup auto-load: no",
    "- Provider/model call: none",
    "- DoNext: Retry with /warmup, /warmup status, or /warmup rebuild.",
  ].join("\n");
}
