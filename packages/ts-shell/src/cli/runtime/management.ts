import type { SessionManager } from '../../session/SessionManager.js';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { ShellActionResult } from '../../core/commands/types.js';
import type { StreamingRenderer } from '../../presentation/terminal/streaming.js';
import { prepareSessionManagement, applySessionManagement } from '../../session/lifecycle/management.js';
import { stripAnsi } from '../../presentation/tui/text/ansi.js';

/** A scripted rename is explicit; deletion remains a preview until interactive confirmation. */
export async function runSessionManagement(input: {
  readonly sessionManager: SessionManager;
  readonly runtimeContext: ShellRuntimeContext;
  readonly renderer: StreamingRenderer;
}, action: ShellActionResult): Promise<void> {
  const context = () => ({ sessionId: input.runtimeContext.session.id, projectRoot: input.runtimeContext.projectRoot, busy: false });
  const result = await prepareSessionManagement(input.sessionManager, context, action.sessionOperation!, action.sessionId);
  if (!result.preview) { input.renderer.renderLine(result.note); return; }
  if (action.sessionOperation === 'delete') {
    const title = stripAnsi(result.preview.session.title || '(untitled)').replace(/[\x00-\x1f\x7f-\x9f]/g, ' ');
    input.renderer.renderLine(`Deletion preview: ${result.preview.session.id} · ${title}. Confirmation is required in an interactive session. No session was deleted.`);
  } else if (action.sessionTitle === undefined) {
    input.renderer.renderLine('Provide a title or use the interactive title editor. No session was renamed.');
  } else input.renderer.renderLine(applySessionManagement(input.sessionManager, context, result.preview, action.sessionTitle).note);
}
