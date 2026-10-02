import type { ShellActionResult } from "../../core/commands/types.js";
import type { ShellRuntimeContext } from "../../core/shell/runtimeContext.js";
import type { SessionManager } from "../../session/SessionManager.js";
import { startNewSession } from "../runtime/session.js";
import { navigateSession } from "../runtime/navigation.js";
import type { ShellSessionRuntime } from "../../core/shell/sessionRuntime.js";

/** Session actions supported by hosts that consume a sequence of prompts. */
export async function runPrintSessionAction(
  action: ShellActionResult,
  input: {
    readonly runtimeContext: ShellRuntimeContext;
    readonly sessionManager: Pick<SessionManager, "createNew" | "discardIfEmpty" | "getSession" | "revertTo">;
    readonly sessionRuntime: Pick<ShellSessionRuntime, "getState" | "summarizeAbandonedTurns">;
    readonly renderLine: (line: string) => void;
  },
): Promise<"exit" | "handled" | undefined> {
  if (action.action === "exit-session") return "exit";
  if (action.action === "navigate-session") {
    const result = await navigateSession(input, action.entryId);
    input.renderLine(result.output);
    if (result.draft !== undefined) input.renderLine(`Prompt available to edit:\n${result.draft}`);
    return "handled";
  }
  if (action.action !== "clear-session") return undefined;
  startNewSession(input.runtimeContext, input.sessionManager);
  input.renderLine(`Started a new session: ${input.runtimeContext.session.id}`);
  return "handled";
}
