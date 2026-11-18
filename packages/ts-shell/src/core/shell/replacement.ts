import type { Session } from '../../session/schema/sessionRecord.js';
import type { SessionManager, ResumeResult, ResumeOptions } from '../../session/SessionManager.js';
import type { ShellRuntimeContext } from './runtimeContext.js';

export interface SessionChangeRequest {
  readonly reason: 'new' | 'resume' | 'fork';
  readonly targetSessionId?: string;
  readonly projectRoot?: string;
  readonly entryId?: string;
  readonly expectedVersion?: string;
  readonly mode?: 'runtime-recovery' | 'continuity-only';
  readonly signal?: AbortSignal;
  readonly admission?: () => string | undefined;
  /** Existing storage owners create candidates after before-event admission. */
  readonly prepare: (assertCurrent: () => void) => Session;
  /** Existing context owners publish synchronously after verified activation. */
  readonly publish: (session: Session) => void;
}

export type SessionChangeResult =
  | { readonly status: 'changed'; readonly session: Session; readonly warning?: string }
  | { readonly status: 'cancelled' | 'refused' | 'unknown'; readonly reason: string };
export type SessionChangePort = (request: SessionChangeRequest) => Promise<SessionChangeResult>;

/** Resolve saved candidates without activation; the installed owner holds the lifecycle transaction. */
export async function resumeShellContext(
  context: ShellRuntimeContext,
  manager: Pick<SessionManager, 'getSession' | 'tryResume'>,
  sessionId: string,
  options: Pick<ResumeOptions, 'mode' | 'expectedVersion' | 'beforeActivate'>,
  publish: (session: Session) => void,
  signal?: AbortSignal,
): Promise<ResumeResult> {
  if (!context.sessionChange) {
    const result = manager.tryResume(sessionId, context.projectRoot, options);
    if (result.ok) publish(result.session);
    return result;
  }
  const target = manager.getSession(sessionId);
  if (!target) return { ok: false, error: 'The selected saved session is unavailable.', recoveryHint: 'Reopen the session picker.' };
  const result = await context.sessionChange({ reason: 'resume', targetSessionId: sessionId, projectRoot: target.projectRoot,
    mode: options.mode, expectedVersion: options.expectedVersion, signal,
    admission: () => { options.beforeActivate?.(); return undefined; },
    prepare: check => {
      check(); const session = manager.getSession(sessionId);
      if (!session) throw new Error('The selected saved session is unavailable.');
      return session;
    }, publish });
  return result.status === 'changed' ? { ok: true, session: result.session, ...(result.warning ? { warning: result.warning } : {}) }
    : { ok: false, error: result.reason, recoveryHint: result.status === 'unknown' ? 'Restart before continuing.' : 'The current conversation was retained.',
      ...(result.status === 'unknown' ? { activation: 'unknown' } : {}) };
}
