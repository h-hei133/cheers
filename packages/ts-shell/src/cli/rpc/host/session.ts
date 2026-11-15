import type { Session } from "../../../session/schema/sessionRecord.js";
import type { SessionManager } from "../../../session/SessionManager.js";
import type { RpcHost } from "../protocol.js";
import {
  applyRpcSessionSwitch,
  navigateRpcTree,
  readLastAssistantText,
  readRpcEntries,
  readRpcSessionStats,
  readRpcTree,
  resolveSessionTargetId,
} from "../runtimeOps.js";
import type { RuntimeRpcHostOptions } from "./contract.js";
import { readRpcForkMessages, readRpcNavigation, readRpcSession } from './read.js';

type SessionHost = Pick<RpcHost, "newSession" | "switchSession" | "setSessionName" | "getSessionStats"
  | "getLastAssistantText" | "fork" | "cloneSession" | "getForkMessages" | "getEntries" | "getTree" | "navigateTree">;

/** Session candidates remain inactive until the owning runtime accepts their identity. */
export function sessionHost(options: RuntimeRpcHostOptions, manager: SessionManager): SessionHost {
  const { runtimeContext, sessionRuntime } = options;
  const selectSession = (session: Session) => {
    if (!applyRpcSessionSwitch(runtimeContext, session, options.switchSession)) return { cancelled: true };
    manager.setCurrentSessionForProject(session.projectRoot, session.id);
    return { cancelled: false, sessionId: session.id };
  };
  return {
    newSession: async (parentSession) => {
      if (options.isStreaming()) return { cancelled: true };
      const created = manager.createNew(runtimeContext.projectRoot, { activate: false,
        ...(parentSession ? { parentSession } : {}) });
      return selectSession(created);
    },
    switchSession: async (sessionPath) => {
      if (options.isStreaming()) return { cancelled: true };
      const targetId = resolveSessionTargetId(sessionPath);
      const resumed = manager.getSession(targetId);
      if (!resumed) throw new Error('The selected session is unavailable.');
      return selectSession(resumed);
    },
    setSessionName: async (name) => {
      const updated = manager.renameSession(runtimeContext.session.id, name);
      runtimeContext.session = updated;
      return { sessionId: updated.id, name: updated.title ?? "" };
    },
    getSessionStats: () => readRpcSessionStats(readRpcSession(runtimeContext, manager)),
    getLastAssistantText: () => readLastAssistantText(readRpcSession(runtimeContext, manager)),
    fork: async (entryId) => {
      if (options.isStreaming()) return { cancelled: true };
      const snapshot = await readRpcNavigation(runtimeContext);
      if (options.isStreaming()) return { cancelled: true };
      const point = snapshot.points.find(candidate => candidate.entryId === entryId && candidate.prompt !== undefined && !candidate.unavailable);
      if (!point) throw new Error('Cannot fork: select a saved user-message entry with complete ancestry.');
      snapshot.assertCurrent();
      const forked = manager.fork(snapshot.session.id, snapshot.projectRoot, { activate: false, entryId, expectedVersion: snapshot.version });
      const selected = selectSession(forked);
      return selected.cancelled ? selected : { ...selected, text: point.prompt };
    },
    cloneSession: async () => {
      if (options.isStreaming()) return { cancelled: true };
      const cloned = manager.fork(runtimeContext.session.id, runtimeContext.projectRoot, { activate: false });
      return selectSession(cloned);
    },
    getForkMessages: () => readRpcForkMessages(runtimeContext),
    getEntries: (since) => readRpcEntries(runtimeContext, since),
    getTree: () => readRpcTree(runtimeContext),
    navigateTree: (entryId, expectedVersion) => navigateRpcTree(runtimeContext, manager, sessionRuntime, entryId, expectedVersion),
  };
}
