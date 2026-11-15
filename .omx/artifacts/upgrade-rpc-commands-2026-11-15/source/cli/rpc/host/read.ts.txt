import type { ShellRuntimeContext } from '../../../core/shell/runtimeContext.js';
import type { SessionManager } from '../../../session/SessionManager.js';
import type { Session } from '../../../session/schema/sessionRecord.js';
import { readSessionNavigationAsync } from '../../../session/query/navigation.js';

/** Read the selected stored conversation without publishing a replacement runtime binding. */
export function readRpcSession(context: ShellRuntimeContext, manager: SessionManager): Session {
  const selected = context.session;
  const active = context.activeSession;
  const current = manager.getSession(selected.id);
  if (!current) throw new Error('The selected session is unavailable.');
  if (context.session !== selected || context.activeSession !== active
    || current.id !== selected.id || current.createdAt !== selected.createdAt
    || current.projectRoot !== selected.projectRoot) {
    throw new Error('The selected session changed during the read.');
  }
  return current;
}

/** Bind asynchronous tree acquisition to the session that requested it. */
export async function readRpcNavigation(context: ShellRuntimeContext) {
  const selected = context.session, active = context.activeSession;
  const cwd = context.cwd, projectRoot = context.projectRoot;
  const signal = context.configuration.backgroundSignal;
  const assertCurrent = () => {
    signal.throwIfAborted();
    if (context.session !== selected || context.activeSession !== active || context.cwd !== cwd || context.projectRoot !== projectRoot) {
      throw new Error('The selected session changed during the read.');
    }
  };
  const snapshot = await readSessionNavigationAsync(selected.id, cwd, { signal });
  assertCurrent();
  if (snapshot.session.id !== selected.id || snapshot.session.createdAt !== selected.createdAt
    || snapshot.session.projectRoot !== selected.projectRoot) {
    throw new Error('The selected session changed during the read.');
  }
  return { ...snapshot, assertCurrent, projectRoot };
}

export async function readRpcForkMessages(context: ShellRuntimeContext): Promise<readonly { readonly entryId: string; readonly text: string }[]> {
  const snapshot = await readRpcNavigation(context);
  snapshot.assertCurrent();
  return snapshot.points.flatMap(point => point.prompt !== undefined && !point.unavailable
    ? [{ entryId: point.entryId, text: point.prompt }] : []);
}
