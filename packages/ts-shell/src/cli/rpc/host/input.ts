import type { ImageContent } from "../../../model-adapters/multimodal.js";
import type { SessionManager } from "../../../session/SessionManager.js";
import type { RpcHost } from "../protocol.js";
import { clearRpcQueue, readRpcState, setRpcQueueMode } from "../runtimeOps.js";
import type { RuntimeRpcHostOptions } from "./contract.js";
import { readRpcSession } from './read.js';
import { shellRuntimeFor } from '../../runtime/shell/index.js';

type InputHost = Pick<RpcHost, "isStreaming" | "getMessages" | "enqueuePrompt" | "steer" | "followUp"
  | "clearQueue" | "abort" | "getState" | "setSteeringMode" | "setFollowUpMode">;

/** Input operations read and change the queue the current runtime will drain. */
export function inputHost(options: RuntimeRpcHostOptions, manager: SessionManager): InputHost {
  const { runtimeContext, sessionRuntime, queue } = options;
  return {
    isStreaming: options.isStreaming,
    getMessages: () => readRpcSession(runtimeContext, manager).turns,
    enqueuePrompt: (prompt, images, traceParent) => {
      options.enqueuePrompt(prompt, images?.length || traceParent
        ? { images: images ?? [], ...(traceParent ? { traceParent } : {}) } : undefined);
    },
    steer: (msg, images?: readonly ImageContent[]) => {
      const activeInput = options.inputReady?.() === false ? undefined : sessionRuntime.input?.();
      if (activeInput?.submit) {
        if (!activeInput.submit('steer', msg, 'rpc', images)) options.enqueuePrompt(msg, images?.length ? { images } : undefined);
      }
      else if (activeInput) {
        if (images?.length) throw new Error("Image attachments on live steer while streaming are unsupported.");
        activeInput.steer(msg);
      } else {
        options.enqueuePrompt(msg, images?.length ? { images } : undefined);
      }
    },
    followUp: (msg, images?: readonly ImageContent[]) => {
      const activeInput = options.inputReady?.() === false ? undefined : sessionRuntime.input?.();
      if (activeInput?.submit) {
        if (!activeInput.submit('followUp', msg, 'rpc', images)) options.enqueuePrompt(msg, images?.length ? { images } : undefined);
      }
      else if (activeInput && !images?.length) {
        activeInput.followUp(msg);
      } else {
        options.enqueuePrompt(msg, images?.length ? { images } : undefined);
      }
    },
    clearQueue: () => clearRpcQueue(sessionRuntime.input?.(), queue),
    abort: () => {
      queue.splice(0);
      sessionRuntime.cancelCurrentRun();
    },
    getState: () => {
      const pending = sessionRuntime.input?.()?.pending();
      return { ...readRpcState(runtimeContext, queue.length + (pending?.steering.length ?? 0)
        + (pending?.followUps.length ?? 0), options.isStreaming(), readRpcSession(runtimeContext, manager)),
        isBashRunning: shellRuntimeFor(runtimeContext)?.isRunning() ?? false,
        isCompacting: sessionRuntime.commands.current?.kind === 'compaction' || sessionRuntime.input?.()?.isCompacting?.() === true };
    },
    setSteeringMode: (mode) => setRpcQueueMode(runtimeContext, sessionRuntime, 'steering', mode),
    setFollowUpMode: (mode) => setRpcQueueMode(runtimeContext, sessionRuntime, 'followUp', mode),
  };
}
