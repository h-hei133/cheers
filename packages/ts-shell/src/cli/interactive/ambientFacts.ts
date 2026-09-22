import { getSessionTodos } from "../../core/commands/todoCommandRuntime.js";
import { AgentRegistryScanner } from "../../core/messaging/agentRegistryScanner.js";
import type { AmbientContext } from "../../presentation/tui/chrome/hints.js";

/**
 * Background facts for the row under the prompt.
 *
 * Only facts with a real source appear here. There is deliberately no
 * "background commands" counter: the shell has no detached execution mode, so
 * the number could only ever be invented.
 */

const scanner = new AgentRegistryScanner();

/** Current ambient state, recomputed per frame from live stores. */
export function readAmbientFacts(sessionId: string): AmbientContext {
  return {
    openTodos: getSessionTodos().filter((todo) => todo.status !== "done").length,
    peerSessions: countPeerSessions(sessionId),
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
