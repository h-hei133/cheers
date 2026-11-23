import type { SessionChangeRequest } from '../../../core/shell/replacement.js';
import { switchActiveSession } from '../../../core/shell/runtimeContext.js';
import type { SessionManager } from "../../../session/SessionManager.js";
import type { RpcHost } from "../protocol.js";
import { annotateSession } from '../../runtime/session/annotations.js';
import {
  applyRpcSessionSwitch,
  navigateRpcTree,
  readLastAssistantText,
  readRpcEntries,
  readRpcSessionStats,
  resolveSessionTargetId,
} from "../runtimeOps.js";
import type { RuntimeRpcHostOptions } from "./contract.js";
import { readRpcForkMessages, readRpcNavigation, readRpcSession, readRpcTree, readSnapshot } from './read.js';

type SessionHost = Pick<RpcHost, "newSession" | "switchSession" | "setSessionName" | "getSessionStats"
  | "getLastAssistantText" | "fork" | "cloneSession" | "getForkMessages" | "getEntries" | "getTree" | "navigateTree" | "annotateSession">;

/** Session candidates remain inactive until the owning runtime accepts their identity. */
export function sessionHost(options: RuntimeRpcHostOptions, manager: SessionManager): SessionHost {
  const { runtimeContext, sessionRuntime } = options;
  const busy = () => options.isStreaming() || sessionRuntime.isRunning?.() === true;
  const selectSession = async (request: Omit<SessionChangeRequest, 'publish'>) => {
    const result = await applyRpcSessionSwitch(runtimeContext, { ...request, publish: session => {
      switchActiveSession(runtimeContext, session, session.projectRoot, { cwd: session.projectRoot, projectRoot: session.projectRoot });
    } }, manager, options.switchSession);
    if (result.status === 'cancelled') return { cancelled: true };
    if (result.status !== 'changed') throw new Error(result.reason);
    return { cancelled: false, sessionId: result.session.id };
  };
  return {
    newSession: async (parentSession) => {
      if (busy()) return { cancelled: true };
      const projectRoot = runtimeContext.projectRoot;
      return await selectSession({ reason: 'new', projectRoot, prepare: check => {
        check(); return manager.createNew(projectRoot, { activate: false, ...(parentSession ? { parentSession } : {}),
          workspaceRoots: runtimeContext.session.workspaceRoots });
      } });
    },
    switchSession: async (sessionPath) => {
      if (busy()) return { cancelled: true };
      const targetId = resolveSessionTargetId(sessionPath);
      const resumed = manager.getSession(targetId);
      if (!resumed) throw new Error('The selected session is unavailable.');
      return await selectSession({ reason: 'resume', targetSessionId: targetId, projectRoot: resumed.projectRoot,
        prepare: check => { check(); const current = manager.getSession(targetId); if (!current) throw new Error('The selected session is unavailable.'); return current; } });
    },
    setSessionName: async (name) => {
      if (busy()) return { cancelled: true };
      const updated = manager.renameSession(runtimeContext.session.id, name);
      runtimeContext.session = updated;
      return { sessionId: updated.id, name: updated.title ?? "" };
    },
    getSessionStats: () => readRpcSessionStats(readRpcSession(runtimeContext, manager)),
    getLastAssistantText: () => readLastAssistantText(readRpcSession(runtimeContext, manager)),
    fork: async (entryId) => {
      if (busy()) return { cancelled: true };
      const snapshot = await readRpcNavigation(runtimeContext);
      if (busy()) return { cancelled: true };
      const point = snapshot.points.find(candidate => candidate.entryId === entryId && candidate.prompt !== undefined && !candidate.unavailable);
      if (!point) throw new Error('Cannot fork: select a saved user-message entry with complete ancestry.');
      snapshot.assertCurrent();
      const selected = await selectSession({ reason: 'fork', projectRoot: snapshot.projectRoot, entryId,
        admission: () => { snapshot.assertCurrent(); return undefined; }, prepare: check => {
          check(); return manager.fork(snapshot.session.id, snapshot.projectRoot, { activate: false, entryId, expectedVersion: snapshot.version });
        } });
      return selected.cancelled ? selected : { ...selected, text: point.prompt };
    },
    cloneSession: async () => {
      if (busy()) return { cancelled: true };
      const sourceId = runtimeContext.session.id, projectRoot = runtimeContext.projectRoot;
      return await selectSession({ reason: 'fork', projectRoot, prepare: check => {
        check(); return manager.fork(sourceId, projectRoot, { activate: false });
      } });
    },
    getForkMessages: () => readRpcForkMessages(runtimeContext),
    getEntries: (since) => readSnapshot(runtimeContext, () => readRpcEntries(runtimeContext, since)),
    getTree: () => readRpcTree(runtimeContext),
    annotateSession: async (request, signal) => {
      if (typeof request.expectedVersion !== 'string' || !request.expectedVersion) return {
        status: 'unchanged', sessionId: runtimeContext.session.id, output: 'Read the current tree version before editing.',
      };
      return annotateSession(runtimeContext, sessionRuntime, { ...request, signal,
        isBusy: () => options.isStreaming() || options.inputReady?.() === false });
    },
    navigateTree: (entryId, expectedVersion) => {
      if (busy()) throw new Error('A session operation is still running.');
      return navigateRpcTree(runtimeContext, manager, sessionRuntime, entryId, expectedVersion);
    },
  };
}
