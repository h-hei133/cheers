import { parseSyntax } from '../../core/commands/syntax/parse.js';
import { sshSyntax } from '../../core/commands/ssh/syntax.js';
import { tokenizeCommandArgs } from '../../core/commands/arguments.js';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import { sshCommandFor } from '../runtime/ssh.js';

export function sshControl(text: string): { readonly action: string; readonly args: string[] } | undefined {
  const match = /^\/ssh(?:\s+([\s\S]*))?$/i.exec(text.trim()); if (!match) return undefined;
  try {
    const args = tokenizeCommandArgs(match[1] ?? ''); const parsed = parseSyntax(sshSyntax, args);
    return parsed.ok && ['status', 'jobs', 'cancel-pending', 'disconnect', 'cancel', 'reconcile', 'output'].includes(parsed.action.name)
      ? { action: parsed.action.name, args } : undefined;
  } catch { return undefined; }
}
export async function runSshControl(text: string, context: ShellRuntimeContext,
  renderer: { renderLine(line: string): void }, questionPending = false): Promise<void> {
  const control = sshControl(text); if (!control) return;
  if (questionPending && !['status', 'jobs', 'cancel-pending', 'disconnect'].includes(control.action)) {
    renderer.renderLine('SSH observation or cancellation approval waits for the current question.'); return;
  }
  const result = await sshCommandFor(context)(control.args, { cwd: context.cwd, projectRoot: context.projectRoot,
    sessionId: context.session.id, interactive: true });
  renderer.renderLine(result.kind === 'local' ? result.output : 'SSH control unavailable.');
}
