import type { ShellRuntimeContext } from '../../../core/shell/runtimeContext.js';
import type { SessionManager } from '../../../session/SessionManager.js';
import type { Session } from '../../../session/schema/sessionRecord.js';

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
