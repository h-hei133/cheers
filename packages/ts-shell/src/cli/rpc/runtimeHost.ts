import { SessionManager } from "../../session/SessionManager.js";
import type { RpcHost } from "./protocol.js";
import type { RuntimeRpcHostOptions } from "./host/contract.js";
import { inputHost } from "./host/input.js";
import { sessionHost } from "./host/session.js";
import { settingsHost } from "./host/settings.js";

export type { RuntimeRpcHostOptions } from "./host/contract.js";

/** Compose the ordinary RPC owners while retaining live session and workspace identity. */
export function createRuntimeRpcHost(options: RuntimeRpcHostOptions): RpcHost {
  const { runtimeContext } = options;
  const manager = options.sessionManager ?? new SessionManager();
  return {
    get sessionId() { return runtimeContext.session.id; },
    get workspaceRoot() { return runtimeContext.projectRoot; },
    ...(options.ui ? { ui: options.ui } : {}),
    ...inputHost(options),
    ...sessionHost(options, manager),
    ...settingsHost(options),
  };
}
