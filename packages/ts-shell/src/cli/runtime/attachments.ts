import type { CommandExecutionResult } from '../../core/commands/types.js';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { SessionManager } from '../../session/SessionManager.js';
import { runContextAttachmentCommand } from '../../context/attachment/command.js';
import { updateContextAttachments } from '../../context/attachment/state.js';
import { configurationAdmission } from '../../core/shell/configuration.js';
import { sourceReaderFor } from '../data/access.js';
import { redactUnsafeReportText } from '../../core/security/reportText.js';

export function contextAttachments(args: readonly string[], input: { readonly runtimeContext: ShellRuntimeContext; readonly sessionManager: SessionManager }): CommandExecutionResult {
  const context = input.runtimeContext;
  const admission = configurationAdmission(context);
  const current = [...context.contextAttachments ?? [], ...context.transientContextAttachments ?? []];
  try {
    const result = runContextAttachmentCommand(args, {
      root: context.cwd, entries: current, read: sourceReaderFor(context),
      persistSession: entry => {
        const entries = [...context.contextAttachments ?? []].filter(item => item.path !== entry.path);
        context.session = updateContextAttachments(input.sessionManager, context.session, [...entries, entry], admission);
        context.contextAttachments = context.session.contextAttachments ?? [];
      },
      dropSession: absolute => {
        context.session = updateContextAttachments(input.sessionManager, context.session, (context.contextAttachments ?? []).filter(entry => entry.path !== absolute), admission);
        context.contextAttachments = context.session.contextAttachments ?? [];
      },
    });
    if (admission()) throw new Error('Context attachment session or workspace changed.');
    context.transientContextAttachments = result.entries.filter(entry => entry.persistence === 'turn');
    return { kind: 'local', output: result.output, state: { status: result.status, entries: result.entries.map(({ content: _content, ...entry }) => entry) } };
  } catch (error) {
    return { kind: 'local', output: 'Context attachment blocked: ' + redactUnsafeReportText(error instanceof Error ? error.message : 'Unavailable.', undefined, 1024), state: { status: 'blocked' } };
  }
}
