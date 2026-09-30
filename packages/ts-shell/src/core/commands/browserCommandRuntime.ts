import { parseBrowserCommandArgs } from "../../browser/commandContract.js";
import { runBrowserCommandAsync } from "../../browser/commandRunner.js";
import { parseBrowserPublicReadOnlyWebSmokeConfig } from "../../browser/smoke/config.js";
import { renderBrowserPublicReadOnlyWebSmokeReport } from "../../browser/smoke/report.js";
import { runBrowserPublicReadOnlyWebSmoke } from "../../browser/smoke/runner.js";
import { emitCommandResultToSidebar } from "./sidebarCommandEvents.js";
import type { CommandContext, LocalCommandResult } from "./types.js";

export async function runBrowserLocalCommand(
  args: string[],
  context: CommandContext,
): Promise<LocalCommandResult> {
  const parsed = parseBrowserCommandArgs(args);
  if (parsed.ok && parsed.contract?.mode === "smoke") {
    const smoke = await runBrowserPublicReadOnlyWebSmoke({
      config: context.browserPublicReadOnlyWebSmokeConfig ?? parseBrowserPublicReadOnlyWebSmokeConfig({ env: {} }),
      httpClient: context.browserPublicReadOnlyHttpClient,
    });
    const result: LocalCommandResult = {
      kind: "local",
      output: renderBrowserPublicReadOnlyWebSmokeReport(smoke),
    };
    emitCommandResultToSidebar(context, {
      command: "/browser",
      args,
      result,
    });
    return result;
  }
  const runResult = parsed.ok && parsed.contract
    ? await runBrowserCommandAsync({
        contract: parsed.contract,
        browserExecutor: context.browserExecutor,
        browserSandboxAuthority: context.browserSandboxAuthority,
        browserNetworkAllowlist: context.browserNetworkAllowlist,
        browserExecutionConfirmations: context.browserExecutionConfirmations,
        browserCliExecutionBridgeSummary: context.browserCliExecutionBridgeSummary,
        browserExternalNetworkRunnerManifest: context.browserExternalNetworkRunnerManifest,
        browserControlledNetworkRunnerManifest: context.browserControlledNetworkRunnerManifest,
        browserPublicReadOnlyWebManifest: context.browserPublicReadOnlyWebManifest,
        browserPublicReadOnlyHttpClient: context.browserPublicReadOnlyHttpClient,
        browserRuntimeManifest: context.browserRuntimeManifest,
        browserRuntimeExecutor: context.browserRuntimeExecutor,
        browserExternalRuntimeManifest: context.browserExternalRuntimeManifest,
        browserSkillRuntimeBinding: context.browserSkillRuntimeBinding,
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
