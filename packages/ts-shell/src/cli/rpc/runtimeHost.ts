import type { ShellRuntimeContext } from "../../core/shell/runtimeContext.js";
import type { PromptAttachments, ShellSessionRuntime } from "../../core/shell/sessionRuntime.js";
import type { SubmissionQueue } from "../interactive/inputQueue.js";
import type { Session } from "../../session/schema/sessionRecord.js";
import { SessionManager } from "../../session/SessionManager.js";
import { setModel } from "../../core/commands/model/selection.js";
import type { ImageContent } from "../../model-adapters/multimodal.js";
import type { RpcHost } from "./protocol.js";
import type { RpcUiBridge } from "./uiBridge.js";
import {
  applyRpcSessionSwitch,
  assertModelApplied,
  buildRpcCommandContext,
  cycleRpcModel,
  cycleRpcThinking,
  listRpcCommands,
  listRpcModels,
  navigateRpcTree,
  readLastAssistantText,
  readRpcEntries,
  readRpcForkMessages,
  readRpcSessionStats,
  readRpcState,
  readRpcTree,
  resolveSessionTargetId,
  saveRpcSetting,
  setRpcThinking,
  THINKING_LEVELS,
} from "./runtimeOps.js";

export interface RuntimeRpcHostOptions {
  readonly runtimeContext: ShellRuntimeContext;
  readonly sessionRuntime: ShellSessionRuntime;
  readonly queue: SubmissionQueue;
  readonly isStreaming: () => boolean;
  readonly enqueuePrompt: (prompt: string, attachments?: PromptAttachments) => void;
  readonly switchSession?: (session: Session) => boolean;
  readonly sessionManager?: SessionManager;
  readonly ui?: RpcUiBridge;
}

/** Build a live `RpcHost` backed by `ShellRuntimeContext`, `ShellSessionRuntime`, and `SessionManager`. */
export function createRuntimeRpcHost(options: RuntimeRpcHostOptions): RpcHost {
  const { runtimeContext, sessionRuntime, queue } = options;
  const manager = options.sessionManager ?? new SessionManager();

  return {
    get sessionId() { return runtimeContext.session.id; },
    get workspaceRoot() { return runtimeContext.projectRoot; },
    ...(options.ui ? { ui: options.ui } : {}),
    isStreaming: options.isStreaming,
    getMessages: () => runtimeContext.session.turns,
    enqueuePrompt: (prompt, images?: readonly ImageContent[]) => {
      options.enqueuePrompt(prompt, images?.length ? { images } : undefined);
    },
    steer: (msg, images?: readonly ImageContent[]) => {
      const activeInput = sessionRuntime.input?.();
      if (activeInput) {
        if (images?.length) throw new Error("Image attachments on live steer while streaming are unsupported.");
        activeInput.steer(msg);
      } else {
        options.enqueuePrompt(msg, images?.length ? { images } : undefined);
      }
    },
    followUp: (msg, images?: readonly ImageContent[]) => {
      const activeInput = sessionRuntime.input?.();
      if (activeInput && !images?.length) {
        activeInput.followUp(msg);
      } else {
        options.enqueuePrompt(msg, images?.length ? { images } : undefined);
      }
    },
    clearQueue: () => {
      const removed = queue.splice(0);
      return { cleared: removed.length, steering: [], followUp: removed };
    },
    abort: () => {
      queue.splice(0);
      sessionRuntime.cancelCurrentRun();
    },
    getState: () => readRpcState(runtimeContext, queue.length, options.isStreaming()),
    newSession: async () => {
      if (options.isStreaming()) return { cancelled: true };
      const created = manager.createNew(runtimeContext.projectRoot);
      applyRpcSessionSwitch(runtimeContext, created, options.switchSession);
      return { cancelled: false, sessionId: created.id };
    },
    switchSession: async (sessionPath) => {
      if (options.isStreaming()) return { cancelled: true };
      const targetId = resolveSessionTargetId(sessionPath);
      const resumed = manager.resume(targetId, runtimeContext.projectRoot);
      applyRpcSessionSwitch(runtimeContext, resumed, options.switchSession);
      return { cancelled: false, sessionId: resumed.id };
    },
    setSessionName: async (name) => {
      const updated = manager.renameSession(runtimeContext.session.id, name);
      runtimeContext.session = updated;
      return { sessionId: updated.id, name: updated.title ?? "" };
    },
    getSessionStats: () => readRpcSessionStats(runtimeContext),
    getLastAssistantText: () => readLastAssistantText(runtimeContext),
    setModel: async (provider, modelId) => {
      const note = assertModelApplied(await setModel([`${provider}/${modelId}`], buildRpcCommandContext(runtimeContext), false));
      return { provider, modelId, note };
    },
    cycleModel: () => cycleRpcModel(runtimeContext),
    getAvailableModels: listRpcModels,
    setThinkingLevel: (level) => setRpcThinking(runtimeContext, level),
    cycleThinkingLevel: () => cycleRpcThinking(runtimeContext),
    getAvailableThinkingLevels: () => THINKING_LEVELS,
    setSteeringMode: (mode) => saveRpcSetting(runtimeContext, "steeringMode", mode),
    setFollowUpMode: (mode) => saveRpcSetting(runtimeContext, "followUpMode", mode),
    compact: (customInstructions) => sessionRuntime.compactHistory(runtimeContext.session.id, customInstructions),
    setAutoCompaction: (enabled) => saveRpcSetting(runtimeContext, "compactionEnabled", enabled),
    setAutoRetry: (enabled) => saveRpcSetting(runtimeContext, "retryEnabled", enabled),
    abortRetry: () => sessionRuntime.cancelCurrentRun(),
    fork: async (entryId) => {
      if (options.isStreaming()) return { cancelled: true };
      const forked = manager.fork(runtimeContext.session.id, runtimeContext.projectRoot, { activate: true, entryId });
      applyRpcSessionSwitch(runtimeContext, forked, options.switchSession);
      return { cancelled: false, sessionId: forked.id };
    },
    cloneSession: async () => {
      if (options.isStreaming()) return { cancelled: true };
      const cloned = manager.fork(runtimeContext.session.id, runtimeContext.projectRoot, { activate: true });
      applyRpcSessionSwitch(runtimeContext, cloned, options.switchSession);
      return { cancelled: false, sessionId: cloned.id };
    },
    getForkMessages: () => readRpcForkMessages(runtimeContext),
    getEntries: (since) => readRpcEntries(runtimeContext, since),
    getTree: () => readRpcTree(runtimeContext),
    navigateTree: (entryId, expectedVersion) => navigateRpcTree(runtimeContext, manager, sessionRuntime, entryId, expectedVersion),
    getCommands: () => listRpcCommands(runtimeContext),
  };
}
