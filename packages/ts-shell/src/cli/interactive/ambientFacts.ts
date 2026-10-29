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

/**
 * How long a peer count is trusted before the registry is walked again.
 *
 * The row under the prompt is repainted on every frame — 30 times a second while
 * an answer streams — and the registry behind this count is a recursive
 * directory walk that reads every subagent definition. A count that is a second
 * old is indistinguishable to a reader; a walk per frame is not free.
 */
const PEER_COUNT_TTL_MS = 1_000;

let peerCount: { readonly sessionId: string; readonly at: number; readonly count: number } | undefined;

/** Current ambient state, recomputed per frame from live stores. */
export function readAmbientFacts(sessionId: string, background?: BackgroundRunner): AmbientContext {
  return {
    openTodos: getSessionTodos(sessionId).filter((todo) => todo.status !== "done" && todo.status !== "dropped").length,
    peerSessions: countPeerSessions(sessionId, Date.now()),
    runningCommands: runningCommandCount(background),
  };
}

function runningCommandCount(background?: BackgroundRunner): AmbientContext['runningCommands'] {
  try {
    return background?.list().filter(task => task.state === 'running' || task.state === 'starting').length ?? 0;
  } catch {
    // A failed display read conveys no knowledge of the task count. The store
    // still owns rejection of unavailable publication and execution requests.
    return 'unavailable';
  }
}

/** Other live sessions reachable for cross-session messaging, at most once a second. */
function countPeerSessions(sessionId: string, now: number): number {
  if (peerCount?.sessionId === sessionId && now - peerCount.at < PEER_COUNT_TTL_MS) return peerCount.count;
  let count: number;
  try {
    count = scanner
      .scanAllReachableAgents()
      .filter((agent) => agent.kind === "local_session" && agent.id !== sessionId).length;
  } catch {
    // The registry lives on the filesystem; an unreadable socket directory is
    // not worth failing a frame over.
    count = 0;
  }
  peerCount = { sessionId, at: now, count };
  return count;
}
