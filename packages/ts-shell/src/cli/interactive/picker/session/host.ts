import type { SessionManager } from '../../../../session/SessionManager.js';
import type { ShellRuntimeContext } from '../../../../core/shell/runtimeContext.js';
import type { PickerHost } from '../registry.js';
import type { SavedSessionSelection } from '../../../../session/navigation/selection.js';
import { configurationAdmission } from '../../../../core/shell/configuration.js';
import { prepareSessionManagement, applySessionManagement } from '../../../../session/lifecycle/management.js';

/** Session controls read the live runtime identity and reuse the existing action owners. */
export function sessionPickerHost(input: {
  readonly runtimeContext: ShellRuntimeContext;
  readonly sessionManager: SessionManager;
  readonly busy: () => boolean;
  readonly admission?: () => string | undefined;
  readonly resume: (sessionId: string, selection: SavedSessionSelection) => Promise<string | undefined>;
}): Pick<PickerHost, 'sessionContext' | 'resumeSession' | 'deleteSession' | 'renameSession' | 'pinSession'> {
  const context = () => ({ sessionId: input.runtimeContext.session.id, projectRoot: input.runtimeContext.projectRoot, busy: input.busy() });
  const change = async (action: 'rename' | 'delete' | 'pin', sessionId: string, version?: string, title?: string): Promise<string | undefined> => {
    const result = await prepareSessionManagement(input.sessionManager, context, action, sessionId);
    if (!result.preview) return result.note;
    if (version && result.preview.version !== version) return 'The saved session changed after the preview. Reopen the session picker.';
    const applied = applySessionManagement(input.sessionManager, context, result.preview, title);
    return applied.status === 'changed' ? undefined : applied.note;
  };
  return {
    sessionContext: context,
    resumeSession: (sessionId, version) => {
      if (!version) return Promise.resolve('The saved session preview is unavailable. Reopen the session picker.');
      if (input.busy()) return Promise.resolve('A session operation is running. Wait before selecting saved sessions.');
      const configuration = configurationAdmission(input.runtimeContext);
      const admission = () => input.admission?.() ?? configuration();
      return input.resume(sessionId, { sessionId, version, admission });
    },
    deleteSession: (sessionId, version) => change('delete', sessionId, version),
    renameSession: (sessionId, title, version) => change('rename', sessionId, version, title),
    pinSession: (sessionId, version) => change('pin', sessionId, version),
  };
}
