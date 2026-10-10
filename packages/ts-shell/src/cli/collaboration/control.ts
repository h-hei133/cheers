import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { StreamingRenderer } from '../../presentation/terminal/streaming.js';
import { tokenizeCommandArgs } from '../../core/commands/arguments.js';
import { collaborationCommandFor } from '../runtime/collaboration.js';

export function isCollaborationControl(text: string): boolean { return /^\/(collab|share|dump|join|leave)(?:\s|$)/i.test(text.trim()); }
export async function runCollaborationControl(text: string, context: ShellRuntimeContext, renderer: Pick<StreamingRenderer, 'renderLine'>, pendingQuestion = false): Promise<void> {
  if (pendingQuestion) { renderer.renderLine('Collaboration control waits for the current approval or question.'); return; }
  const match = /^\/(collab|share|dump|join|leave)(?:\s+([\s\S]*))?$/i.exec(text.trim()); if (!match) return;
  const name = match[1]!.toLowerCase(); const args = tokenizeCommandArgs(match[2] ?? '');
  const result = await collaborationCommandFor(context)(name === 'share' || name === 'dump' ? name : 'collab',
    name === 'join' ? ['join', ...args] : name === 'leave' ? ['leave', ...args] : args,
    { cwd: context.cwd, projectRoot: context.projectRoot, sessionId: context.session.id, interactive: true });
  renderer.renderLine(result.kind === 'local' ? result.output : 'Prompt acceptance waits until the current run is idle.');
}
