import type { SessionManager } from '../../session/SessionManager.js';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import { hasUnfinishedSessionWork } from '../../session/recovery/work.js';

/** Signal termination must observe recovery evidence before resource cancellation. */
export function signalSessionClose(context: ShellRuntimeContext,
  manager: Pick<SessionManager, 'getRecoverySnapshot' | 'saveTerminated'>,
  isBusy: () => boolean): () => void {
  return () => {
    const sessionId = context.session.id;
    if (isBusy() || hasUnfinishedSessionWork(manager.getRecoverySnapshot(sessionId))) return;
    manager.saveTerminated(sessionId);
  };
}
