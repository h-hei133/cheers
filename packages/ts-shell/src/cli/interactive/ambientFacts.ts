import { getSessionTodos } from "../../core/commands/todoCommandRuntime.js";
import { AgentRegistryScanner } from "../../core/messaging/agentRegistryScanner.js";
import type { BackgroundRunner } from '../../workflow/jobs/local/model.js';
import type { AmbientContext } from "../../presentation/tui/chrome/hints.js";

/**
 * Background facts for the row under the prompt.
 *
 * Only facts with a real source appear here. The count of running commands has
 * one now that the shell can start a command and not wait for it; before that it
 * would have been a number with nothing behind it.
 */

const scanner = new AgentRegistryScanner();

/** Current ambient state, recomputed per frame from live stores. */
export function readAmbientFacts(sessionId: string, background?: BackgroundRunner): AmbientContext {
  return {
    openTodos: getSessionTodos(sessionId).filter((todo) => todo.status !== "done").length,
    peerSessions: countPeerSessions(sessionId),
    runningCommands: background?.list().filter((task) => task.state === "running" || task.state === 'starting').length ?? 0,
  };
}

/** Other live sessions reachable for cross-session messaging. */
function countPeerSessions(sessionId: string): number {
  try {
    return scanner
      .scanAllReachableAgents()
      .filter((agent) => agent.kind === "local_session" && agent.id !== sessionId).length;
  } catch {
    // The registry lives on the filesystem; an unreadable socket directory is
    // not worth failing a frame over.
    return 0;
  }
}
