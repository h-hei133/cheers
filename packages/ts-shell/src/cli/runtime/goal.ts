import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { CommandContext } from '../../core/commands/types.js';
import type { Session } from '../../session/schema/sessionRecord.js';
import { readGoalEdit, writeGoal, goalIsDetached, type GoalStoreHost } from '../../planning/goal/store.js';
import { goalObjective } from '../../planning/goal/projection.js';
import { runSessionGoalCommand } from '../../planning/goal/command.js';

interface Activation { readonly session: Session; readonly projectRoot: string; readonly issue?: string }
const activations = new WeakMap<ShellRuntimeContext, Activation>();

/** Selection/reentry is not authorization to reactivate a persisted goal. */
export function prepareGoalSession(context: ShellRuntimeContext, host: GoalStoreHost): Activation {
  const previous = activations.get(context);
  if (previous?.session === context.session && previous.projectRoot === context.projectRoot) return previous;
  let issue: string | undefined;
  try {
    const edit = readGoalEdit(host, context.session);
    if (edit.goal?.phase === 'active' && !goalIsDetached(edit)) writeGoal(host, context.session, edit, { type: 'reentry' });
  } catch {
    issue = 'Session goal reentry could not be confirmed. Goal steering is disabled; reopen the session before a goal update.';
  }
  const activation = { session: context.session, projectRoot: context.projectRoot, ...(issue ? { issue } : {}) };
  activations.set(context, activation);
  return activation;
}

export function goalCommandFor(context: ShellRuntimeContext, host: GoalStoreHost): NonNullable<CommandContext['goalCommand']> {
  prepareGoalSession(context, host);
  return async (args, commandContext) => {
    const activation = prepareGoalSession(context, host);
    return activation.issue ? { kind: 'local', output: activation.issue }
      : runSessionGoalCommand(args, commandContext, host, context.session);
  };
}

/** Only the current bound goal reaches a newly submitted turn. */
export function goalObjectiveFor(context: ShellRuntimeContext, host: GoalStoreHost): string | undefined {
  if (prepareGoalSession(context, host).issue) return undefined;
  try { return goalObjective(readGoalEdit(host, context.session)); }
  catch { return undefined; }
}
