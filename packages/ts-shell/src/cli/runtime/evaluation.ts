import type { CommandContext } from '../../core/commands/types.js';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import { jobsFor } from './jobs.js';
import { runEvaluationCommand, pendingEvaluations } from '../evaluation/command.js';
import { liveEvaluations } from '../evaluation/owner.js';
import { evaluationTools } from '../evaluation/tools.js';
import { improveSyntax } from '../../core/commands/improve/syntax.js';
import { parseSyntax } from '../../core/commands/syntax/parse.js';
import { tokenizeCommandArgs } from '../../core/commands/arguments.js';

export function evaluationCommandFor(context: ShellRuntimeContext): NonNullable<CommandContext['improveCommand']> {
  return async (args, command) => {
    const host = jobsFor(context);
    return host && host.session.id === command.sessionId && command.cwd === context.cwd ? runEvaluationCommand(host, args)
      : { kind: 'local', output: 'Evaluation requires the current bound session runtime.' };
  };
}
export function evaluationFeatureTools(context: ShellRuntimeContext) {
  const owner = liveEvaluations.get(context); return owner && !owner.admission() ? evaluationTools(owner) : [];
}
export function cancelEvaluationFor(context: ShellRuntimeContext): void {
  pendingEvaluations.delete(context); liveEvaluations.get(context)?.cancel();
}
export function evaluationInterruptible(context: ShellRuntimeContext): boolean {
  return pendingEvaluations.has(context) || Boolean(liveEvaluations.get(context)?.running);
}
export function evaluationControl(text: string): 'status' | 'stop' | undefined {
  if (!/^\/improve(?:\s|$)/i.test(text.trim())) return undefined;
  const parsed = parseSyntax(improveSyntax, tokenizeCommandArgs(text.trim().replace(/^\/improve\s*/i, '')));
  return parsed.ok && (parsed.action.name === 'status' || parsed.action.name === 'stop') ? parsed.action.name : undefined;
}
