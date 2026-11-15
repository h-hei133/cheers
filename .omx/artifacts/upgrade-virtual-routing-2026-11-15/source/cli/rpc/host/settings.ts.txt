import { setModel } from "../../../core/commands/model/selection.js";
import type { RpcHost } from "../protocol.js";
import {
  assertModelApplied,
  buildRpcCommandContext,
  cycleRpcModel,
  cycleRpcThinking,
  listRpcCommands,
  listRpcModels,
  saveRpcSetting,
  setRpcThinking,
  THINKING_LEVELS,
} from "../runtimeOps.js";
import type { RuntimeRpcHostOptions } from "./contract.js";

type SettingsHost = Pick<RpcHost, "setModel" | "cycleModel" | "getAvailableModels" | "setThinkingLevel"
  | "cycleThinkingLevel" | "getAvailableThinkingLevels" | "compact" | "setAutoCompaction"
  | "setAutoRetry" | "abortRetry" | "getCommands">;

/** Settings commands reuse ordinary configuration admission and the live session runtime. */
export function settingsHost(options: RuntimeRpcHostOptions): SettingsHost {
  const { runtimeContext, sessionRuntime } = options;
  return {
    setModel: async (provider, modelId) => {
      const note = assertModelApplied(await setModel([`${provider}/${modelId}`], buildRpcCommandContext(runtimeContext), false));
      return { provider, modelId, note };
    },
    cycleModel: () => cycleRpcModel(runtimeContext),
    getAvailableModels: () => listRpcModels(runtimeContext),
    setThinkingLevel: (level) => setRpcThinking(runtimeContext, level),
    cycleThinkingLevel: () => cycleRpcThinking(runtimeContext),
    getAvailableThinkingLevels: () => THINKING_LEVELS,
    compact: (customInstructions) => sessionRuntime.compactHistory(runtimeContext.session.id, customInstructions),
    setAutoCompaction: (enabled) => saveRpcSetting(runtimeContext, "compactionEnabled", enabled),
    setAutoRetry: (enabled) => saveRpcSetting(runtimeContext, "retryEnabled", enabled),
    abortRetry: () => sessionRuntime.cancelCurrentRun(),
    getCommands: () => listRpcCommands(runtimeContext),
  };
}
