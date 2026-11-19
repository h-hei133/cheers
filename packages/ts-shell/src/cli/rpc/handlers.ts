import type { RpcCommand, RpcHost, RpcReadSnapshot } from "./protocol.js";

export type RpcHandlerOutcome =
  | { readonly handled: true; readonly data?: Record<string, unknown>; readonly assertCurrent?: () => void }
  | { readonly handled: true; readonly error: string; readonly data?: Record<string, unknown> }
  | { readonly handled: false };

function unavailable(name: string): RpcHandlerOutcome {
  return { handled: true, error: `RPC command '${name}' is unavailable in this host.` };
}

function isReadSnapshot<T>(result: T | RpcReadSnapshot<T>): result is RpcReadSnapshot<T> {
  return result !== null && typeof result === 'object' && 'data' in result
    && 'assertCurrent' in result && typeof result.assertCurrent === 'function';
}

async function handleSessionAndStats(command: RpcCommand, host: RpcHost, signal?: AbortSignal): Promise<RpcHandlerOutcome> {
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
    case "get_commands": {
      if (!host.getCommands) return unavailable(command.type);
      const result = await host.getCommands(signal);
      return 'commands' in result ? { handled: true, data: { commands: result.commands }, assertCurrent: result.assertCurrent }
        : { handled: true, data: { commands: result } };
    }
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
    case "get_available_thinking_levels": {
      if (!host.getAvailableThinkingLevels) return unavailable(command.type);
      const result = host.getAvailableThinkingLevels();
      return { handled: true, data: 'levels' in result ? { ...result } : { levels: result } };
    }
    default:
      return { handled: false };
  }
}

async function handleTreeAndExecution(command: RpcCommand, host: RpcHost, signal?: AbortSignal): Promise<RpcHandlerOutcome> {
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
      return { handled: true, error: reason, data: { ...outcome } };
    }
    case "set_auto_compaction": {
      if (!host.setAutoCompaction) return unavailable(command.type);
      const result = await host.setAutoCompaction(command.enabled);
      return { handled: true, ...(result ? { data: { ...result } } : {}) };
    }
    case "set_auto_retry": {
      if (!host.setAutoRetry) return unavailable(command.type);
      const result = await host.setAutoRetry(command.enabled);
      return { handled: true, ...(result ? { data: { ...result } } : {}) };
    }
    case "abort_retry":
      if (!host.abortRetry) return unavailable(command.type);
      host.abortRetry();
      return { handled: true };
    case "fork":
      return host.fork ? { handled: true, data: await host.fork(command.entryId) } : unavailable(command.type);
    case "clone":
      return host.cloneSession ? { handled: true, data: await host.cloneSession() } : unavailable(command.type);
    case "get_fork_messages": {
      if (!host.getForkMessages) return unavailable(command.type);
      const result = await host.getForkMessages();
      return isReadSnapshot(result) ? { handled: true, data: { messages: result.data }, assertCurrent: result.assertCurrent }
        : { handled: true, data: { messages: result } };
    }
    case "get_entries": {
      if (!host.getEntries) return unavailable(command.type);
      const result = await host.getEntries(command.since);
      return isReadSnapshot(result) ? { handled: true, data: result.data, assertCurrent: result.assertCurrent }
        : { handled: true, data: result };
    }
    case "get_tree": {
      if (!host.getTree) return unavailable(command.type);
      const result = await host.getTree();
      return isReadSnapshot(result) ? { handled: true, data: result.data, assertCurrent: result.assertCurrent }
        : { handled: true, data: result };
    }
    case "navigate_tree": {
      if (!host.navigateTree) return unavailable(command.type);
      const nav = await host.navigateTree(command.entryId, command.expectedVersion);
      return { handled: true, data: { ...nav } };
    }
    case 'annotate_session': {
      if (!host.annotateSession) return unavailable(command.type);
      const result = await host.annotateSession(command, signal);
      return result.status === 'committed' ? { handled: true, data: { ...result } }
        : { handled: true, error: result.output, data: { ...result } };
    }
    case "bash": {
      if (!host.runBash) return unavailable(command.type);
      const data = await host.runBash(command.command, command.excludeFromContext);
      if (data.isError === true || data.historySaved !== undefined && data.historySaved !== 'saved') {
        return { handled: true, data, error: data.historySaved !== undefined && data.historySaved !== 'saved'
          ? 'Shell result history could not be confirmed; execution evidence is retained in data.'
          : 'Shell command did not complete successfully; execution evidence is retained in data.' };
      }
      return { handled: true, data };
    }
    case "abort_bash":
      if (!host.abortBash) return unavailable(command.type);
      host.abortBash();
      return { handled: true };
    default:
      return { handled: false };
  }
}

/** Dispatch extended session, model, thinking, compaction, tree, and bash RPC commands. */
export async function handleExtendedRpcCommand(command: RpcCommand, host: RpcHost, signal?: AbortSignal): Promise<RpcHandlerOutcome> {
  // Register command ownership before the transport admits a following abort
  // or session command. Its response may settle much later.
  if (command.type === 'bash' || command.type === 'abort_bash' || command.type === 'compact' || command.type === 'annotate_session') {
    return handleTreeAndExecution(command, host, signal);
  }
  const sessionOutcome = await handleSessionAndStats(command, host, signal);
  if (sessionOutcome.handled) return sessionOutcome;
  const modelOutcome = await handleModelAndThinking(command, host);
  if (modelOutcome.handled) return modelOutcome;
  return handleTreeAndExecution(command, host, signal);
}
