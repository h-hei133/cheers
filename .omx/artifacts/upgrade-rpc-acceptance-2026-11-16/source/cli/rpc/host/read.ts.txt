import type { ShellRuntimeContext } from '../../../core/shell/runtimeContext.js';
import type { SessionManager } from '../../../session/SessionManager.js';
import type { Session } from '../../../session/schema/sessionRecord.js';
import { readSessionNavigationAsync } from '../../../session/query/navigation.js';
import type { RpcReadSnapshot } from '../protocol.js';

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

/** Capture the binding once and carry it through every asynchronous read consumer. */
export function readAdmission(context: ShellRuntimeContext): () => void {
  const selected = context.session, active = context.activeSession;
  const cwd = context.cwd, projectRoot = context.projectRoot;
  const configuration = context.configuration, publication = configuration.current;
  const signal = configuration.backgroundSignal;
  return () => {
    signal.throwIfAborted();
    if (context.session !== selected || context.activeSession !== active || context.cwd !== cwd || context.projectRoot !== projectRoot
      || context.configuration !== configuration || configuration.current !== publication) {
      throw new Error('The selected session changed during the read.');
    }
  };
}

export async function readSnapshot<T>(context: ShellRuntimeContext, read: () => Promise<T>): Promise<RpcReadSnapshot<T>> {
  const assertCurrent = readAdmission(context);
  assertCurrent();
  const data = await read();
  assertCurrent();
  return { data, assertCurrent };
}

/** Bind asynchronous tree acquisition to the session that requested it. */
export async function readRpcNavigation(context: ShellRuntimeContext) {
  const selected = context.session, cwd = context.cwd, projectRoot = context.projectRoot;
  const signal = context.configuration.backgroundSignal;
  const assertCurrent = readAdmission(context);
  const snapshot = await readSessionNavigationAsync(selected.id, cwd, { signal });
  assertCurrent();
  if (snapshot.session.id !== selected.id || snapshot.session.createdAt !== selected.createdAt
    || snapshot.session.projectRoot !== selected.projectRoot) {
    throw new Error('The selected session changed during the read.');
  }
  return { ...snapshot, assertCurrent, projectRoot };
}

export async function readRpcForkMessages(context: ShellRuntimeContext): Promise<RpcReadSnapshot<readonly { readonly entryId: string; readonly text: string }[]>> {
  const snapshot = await readRpcNavigation(context);
  snapshot.assertCurrent();
  const data = snapshot.points.flatMap(point => point.prompt !== undefined && !point.unavailable
    ? [{ entryId: point.entryId, text: point.prompt }] : []);
  return { data, assertCurrent: snapshot.assertCurrent };
}
