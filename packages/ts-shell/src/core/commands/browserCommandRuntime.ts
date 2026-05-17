import { parseBrowserCommandArgs } from "../context/browserCommandContract.js";
import { runBrowserCommand } from "../context/browserCommandRunner.js";
import { emitCommandResultToSidebar } from "./sidebarCommandEvents.js";
import type { CommandContext, LocalCommandResult } from "./types.js";

export async function runBrowserLocalCommand(
  args: string[],
  context: CommandContext,
): Promise<LocalCommandResult> {
  const parsed = parseBrowserCommandArgs(args);
  const result: LocalCommandResult = parsed.ok && parsed.contract
    ? {
        kind: "local",
        output: runBrowserCommand({ contract: parsed.contract }).output,
      }
    : {
        kind: "local",
        output: parsed.errorOutput ?? "Unsupported /browser arguments.",
      };
  emitCommandResultToSidebar(context, {
    command: "/browser",
    args,
    result,
  });
  return result;
}
