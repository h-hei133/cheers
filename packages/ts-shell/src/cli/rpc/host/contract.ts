import type { ShellRuntimeContext } from "../../../core/shell/runtimeContext.js";
import type { PromptAttachments, ShellSessionRuntime } from "../../../core/shell/sessionRuntime.js";
import type { SubmissionQueue } from "../../interactive/inputQueue.js";
import type { Session } from "../../../session/schema/sessionRecord.js";
import type { SessionManager } from "../../../session/SessionManager.js";
import type { RpcUiBridge } from "../uiBridge.js";

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
