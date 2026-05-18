import { parseBrowserCommandArgs } from "../context/browserCommandContract.js";
import { runBrowserCommandAsync } from "../context/browserCommandRunner.js";
import { emitCommandResultToSidebar } from "./sidebarCommandEvents.js";
import type { CommandContext, LocalCommandResult } from "./types.js";

export async function runBrowserLocalCommand(
  args: string[],
  context: CommandContext,
): Promise<LocalCommandResult> {
  const parsed = parseBrowserCommandArgs(args);
  const runResult = parsed.ok && parsed.contract
    ? await runBrowserCommandAsync({
        contract: parsed.contract,
        browserExecutor: context.browserExecutor,
        browserSandboxAuthority: context.browserSandboxAuthority,
        browserNetworkAllowlist: context.browserNetworkAllowlist,
        browserExecutionConfirmations: context.browserExecutionConfirmations,
        browserCliExecutionBridgeSummary: context.browserCliExecutionBridgeSummary,
        browserExternalNetworkRunnerManifest: context.browserExternalNetworkRunnerManifest,
        browserActionCache: context.browserActionCache,
        browserReceiptCacheStore: context.browserReceiptCacheStore,
      })
    : undefined;
  const result: LocalCommandResult = parsed.ok && parsed.contract
    ? {
        kind: "local",
        output: runResult?.output ?? "Unsupported /browser arguments.",
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
