import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import { configurationAdmission } from '../../core/shell/configuration.js';
import type { SessionManager } from '../../session/SessionManager.js';
import type { UndoHost } from '../../edit/recovery/undo/service.js';
import path from 'node:path';

/** A durable user-authority result refreshes the next model request without rewinding conversation. */
export function undoPickerHost(input: { readonly runtimeContext: ShellRuntimeContext; readonly sessionManager: Pick<SessionManager, 'addTurn'>; readonly busy: () => boolean }): UndoHost {
  const context = input.runtimeContext;
  const admission = configurationAdmission(context);
  return { busy: input.busy,
    context: () => ({ cwd: context.cwd, projectRoot: context.projectRoot, sessionId: context.session.id,
      workspaceRoots: context.session.workspaceRoots, admission, readConfiguration: () => context.configuration.current }),
    publish: (result, receipt) => input.sessionManager.addTurn(receipt.sessionId, { role: 'user',
      content: `[Local file undo result]\n${result.operationId}: ${result.status}. Previous file reads may be stale; re-read affected files before editing.\n${receipt.files.map((file, index) => `${JSON.stringify(path.join(file.workspace.path, file.path))}: ${result.files[index]?.status ?? 'unknown'}`).join('\n')}`,
      metadata: { fileUndo: { operationId: result.operationId, status: result.status, files: result.files } } }),
  };
}
