import type { SessionManager } from '../../../../session/SessionManager.js';
import type { ShellRuntimeContext } from '../../../../core/shell/runtimeContext.js';
import type { PickerHost } from '../registry.js';

/** Session controls read the live runtime identity and reuse the existing action owners. */
export function sessionPickerHost(input: {
  readonly runtimeContext: ShellRuntimeContext;
  readonly sessionManager: SessionManager;
  readonly busy: () => boolean;
  readonly resume: (sessionId: string) => Promise<string | undefined>;
}): Pick<PickerHost, 'sessionContext' | 'resumeSession' | 'deleteSession' | 'renameSession'> {
  return {
    sessionContext: () => ({ sessionId: input.runtimeContext.session.id,
      projectRoot: input.runtimeContext.projectRoot, busy: input.busy() }),
    resumeSession: input.resume,
    deleteSession: async sessionId => { input.sessionManager.deleteSession(sessionId); return undefined; },
    renameSession: async (sessionId, title) => { input.sessionManager.renameSession(sessionId, title); return undefined; },
  };
}
