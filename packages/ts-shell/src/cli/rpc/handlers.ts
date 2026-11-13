import type { RpcCommand, RpcHost } from "./protocol.js";

export type RpcHandlerOutcome =
  | { readonly handled: true; readonly data?: Record<string, unknown> }
  | { readonly handled: true; readonly error: string }
  | { readonly handled: false };

function unavailable(name: string): RpcHandlerOutcome {
  return { handled: true, error: `RPC command '${name}' is unavailable in this host.` };
}

async function handleSessionAndStats(command: RpcCommand, host: RpcHost): Promise<RpcHandlerOutcome> {
  switch (command.type) {
    case "new_session":
      return host.newSession ? { handled: true, data: await host.newSession(command.parentSession) } : unavailable(command.type);
    case "switch_session":
      return host.switchSession ? { handled: true, data: await host.switchSession(command.sessionPath) } : unavailable(command.type);
    case "set_session_name": {
      if (!host.setSessionName) return unavailable(command.type);
      if (!command.name.trim()) return { handled: true, error: "Session name cannot be empty." };
      return { handled: true, data: await host.setSessionName(command.name) };
    }
    case "get_session_stats":
      return host.getSessionStats ? { handled: true, data: host.getSessionStats() } : unavailable(command.type);
    case "get_last_assistant_text":
      return host.getLastAssistantText
        ? { handled: true, data: { text: host.getLastAssistantText() } }
        : unavailable(command.type);
    case "get_commands":
      return host.getCommands ? { handled: true, data: { commands: host.getCommands() } } : unavailable(command.type);
    default:
      return { handled: false };
  }
}

async function handleModelAndThinking(command: RpcCommand, host: RpcHost): Promise<RpcHandlerOutcome> {
  switch (command.type) {
    case "set_model":
      return host.setModel ? { handled: true, data: await host.setModel(command.provider, command.modelId) } : unavailable(command.type);
    case "cycle_model": {
      if (!host.cycleModel) return unavailable(command.type);
      const next = await host.cycleModel();
      return { handled: true, data: next ?? { model: null } };
    }
    case "get_available_models":
      return host.getAvailableModels ? { handled: true, data: { models: host.getAvailableModels() } } : unavailable(command.type);
    case "set_thinking_level":
      return host.setThinkingLevel ? { handled: true, data: await host.setThinkingLevel(command.level) } : unavailable(command.type);
    case "cycle_thinking_level": {
      if (!host.cycleThinkingLevel) return unavailable(command.type);
      const next = await host.cycleThinkingLevel();
      return { handled: true, data: next ?? { level: null } };
    }
    case "get_available_thinking_levels":
      return host.getAvailableThinkingLevels ? { handled: true, data: { levels: host.getAvailableThinkingLevels() } } : unavailable(command.type);
    default:
      return { handled: false };
  }
}

async function handleTreeAndExecution(command: RpcCommand, host: RpcHost): Promise<RpcHandlerOutcome> {
  switch (command.type) {
    case "set_steering_mode":
      if (!host.setSteeringMode) return unavailable(command.type);
      await host.setSteeringMode(command.mode);
      return { handled: true };
    case "set_follow_up_mode":
      if (!host.setFollowUpMode) return unavailable(command.type);
      await host.setFollowUpMode(command.mode);
      return { handled: true };
    case "compact": {
      if (!host.compact) return unavailable(command.type);
      const outcome = await host.compact(command.customInstructions);
      if (outcome.status === "compacted") return { handled: true, data: { ...outcome } };
      const reason = "reason" in outcome ? outcome.reason : "Compaction cannot start while a run is active.";
      return { handled: true, error: reason };
    }
    case "set_auto_compaction":
      if (!host.setAutoCompaction) return unavailable(command.type);
      await host.setAutoCompaction(command.enabled);
      return { handled: true };
    case "set_auto_retry":
      if (!host.setAutoRetry) return unavailable(command.type);
      await host.setAutoRetry(command.enabled);
      return { handled: true };
    case "abort_retry":
      if (!host.abortRetry) return unavailable(command.type);
      host.abortRetry();
      return { handled: true };
    case "fork":
      return host.fork ? { handled: true, data: await host.fork(command.entryId) } : unavailable(command.type);
    case "clone":
      return host.cloneSession ? { handled: true, data: await host.cloneSession() } : unavailable(command.type);
    case "get_fork_messages":
      return host.getForkMessages ? { handled: true, data: { messages: await host.getForkMessages() } } : unavailable(command.type);
    case "get_entries":
      return host.getEntries ? { handled: true, data: await host.getEntries(command.since) } : unavailable(command.type);
    case "get_tree":
      return host.getTree ? { handled: true, data: await host.getTree() } : unavailable(command.type);
    case "navigate_tree": {
      if (!host.navigateTree) return unavailable(command.type);
      const nav = await host.navigateTree(command.entryId, command.expectedVersion);
      return { handled: true, data: { ...nav } };
    }
    case "bash":
      return host.runBash ? { handled: true, data: await host.runBash(command.command, command.excludeFromContext) } : unavailable(command.type);
    case "abort_bash":
      if (!host.abortBash) return unavailable(command.type);
      host.abortBash();
      return { handled: true };
    default:
      return { handled: false };
  }
}

/** Dispatch extended session, model, thinking, compaction, tree, and bash RPC commands. */
export async function handleExtendedRpcCommand(command: RpcCommand, host: RpcHost): Promise<RpcHandlerOutcome> {
  const sessionOutcome = await handleSessionAndStats(command, host);
  if (sessionOutcome.handled) return sessionOutcome;
  const modelOutcome = await handleModelAndThinking(command, host);
  if (modelOutcome.handled) return modelOutcome;
  return handleTreeAndExecution(command, host);
}
