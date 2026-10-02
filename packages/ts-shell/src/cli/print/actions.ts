import type { ShellActionResult } from "../../core/commands/types.js";
import type { ShellRuntimeContext } from "../../core/shell/runtimeContext.js";
import type { SessionManager } from "../../session/SessionManager.js";
import { startNewSession } from "../runtime/session.js";

/** Session actions supported by hosts that consume a sequence of prompts. */
export function runPrintSessionAction(
  action: ShellActionResult,
  input: {
    readonly runtimeContext: ShellRuntimeContext;
    readonly sessionManager: Pick<SessionManager, "createNew" | "discardIfEmpty">;
    readonly renderLine: (line: string) => void;
  },
): "exit" | "handled" | undefined {
  if (action.action === "exit-session") return "exit";
  if (action.action !== "clear-session") return undefined;
  startNewSession(input.runtimeContext, input.sessionManager);
  input.renderLine(`Started a new session: ${input.runtimeContext.session.id}`);
  return "handled";
}
