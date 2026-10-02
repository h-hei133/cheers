import { replayTodosFromMessages } from "../../core/commands/todoCommandRuntime.js";
import type { ShellRuntimeContext } from "../../core/shell/runtimeContext.js";
import type { ShellSessionRuntime } from "../../core/shell/sessionRuntime.js";
import { markContextUnknown } from "../../observability/usageTelemetry.js";
import type { SessionManager } from "../../session/SessionManager.js";
import { readSessionNavigation } from "../../session/query/navigation.js";
import { sessionThreadPath } from "../../session/schema/sessionThread.js";

export interface SessionNavigationResult {
  readonly changed: boolean;
  readonly output: string;
  readonly draft?: string;
}

/** The same leaf switch and branch summary serve terminal and scripted hosts. */
export async function navigateSession(input: {
  readonly runtimeContext: ShellRuntimeContext;
  readonly sessionManager: Pick<SessionManager, "getSession" | "revertTo">;
  readonly sessionRuntime: Pick<ShellSessionRuntime, "getState" | "summarizeAbandonedTurns">;
}, entryId?: string): Promise<SessionNavigationResult> {
  const { runtimeContext: context, sessionManager: manager, sessionRuntime: runtime } = input;
  const { thread, points } = readSessionNavigation(context.session.id, context.cwd);
  if (entryId === undefined) {
    return {
      changed: false,
      output: ["### Session tree", "", ...points.map((point) =>
        `${"  ".repeat(point.depth)}- ${point.current ? "* " : ""}${point.entryId} ${point.label}${point.unavailable ? ` [unavailable: ${point.unavailable}]` : ""}`),
      "", "Use /tree <entry-id> to continue from an entry. Other branches and files are kept."].join("\n"),
    };
  }
  if (runtime.getState() === "running") throw new Error("Wait for the current turn to finish before navigating the session.");
  const point = points.find((candidate) => candidate.entryId === entryId);
  if (!point) throw new Error(`No entry with id ${entryId} in this session.`);
  if (point.unavailable || !sessionThreadPath(thread, entryId).resolved) {
    throw new Error(`Cannot navigate to ${entryId}: ${point.unavailable ?? "broken ancestry"}.`);
  }
  if (thread.activeLeafId === entryId) return { changed: false, output: "Already at that point in the conversation." };
  const dropped = await manager.revertTo(context.session.id, entryId,
    (abandoned) => runtime.summarizeAbandonedTurns(abandoned));
  if (readSessionNavigation(context.session.id, context.cwd).thread.activeLeafId !== entryId) {
    throw new Error("The session did not retain the requested navigation. Reload the session tree before retrying.");
  }
  const restored = manager.getSession(context.session.id);
  if (!restored) throw new Error("The navigated session could not be reloaded.");
  context.session = restored;
  markContextUnknown(restored.id);
  replayTodosFromMessages(restored.id, restored.turns);
  return {
    changed: true,
    output: `Now at ${entryId}. ${dropped} later ${dropped === 1 ? "turn is" : "turns are"} kept in the session tree. Files are unchanged.`,
    ...(point.prompt !== undefined ? { draft: point.prompt } : {}),
  };
}
