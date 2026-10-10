import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { CommandContext } from '../../core/commands/types.js';
import type { Session } from '../../session/schema/sessionRecord.js';
import { readGoalEdit, goalIsDetached, type GoalStoreHost } from '../../planning/goal/store.js';
import { goalObjective } from '../../planning/goal/projection.js';
import { runSessionGoalCommand } from '../../planning/goal/command.js';
import { goalRequestPolicy } from '../../planning/goal/budget.js';
import { ModelAdmissionError, type RequestPolicy } from '../../core/agent/request/model.js';
import { recoverGoalRun, type GoalRunStoreHost } from '../../planning/goal/run/store.js';
import { goalCommandAliases, parseGoalArgs } from '../../core/commands/goal/syntax.js';
import { schedulerForContext } from './goalScheduling.js';
import { pauseAdvisor } from './advisor.js';
import { collaborationPolicyFor } from '../collaboration/policy.js';

interface Activation { readonly session: Session; readonly projectRoot: string; readonly issue?: string }
const activations = new WeakMap<ShellRuntimeContext, Activation>();

/** Selection/reentry is not authorization to reactivate a persisted goal. */
export function prepareGoalSession(context: ShellRuntimeContext, host: GoalStoreHost): Activation {
  const previous = activations.get(context);
  if (previous?.session === context.session && previous.projectRoot === context.projectRoot) return previous;
  let issue: string | undefined;
  try {
    const edit = readGoalEdit(host, context.session);
    if ((edit.goal?.phase === 'active' || edit.goal?.runOwner) && !goalIsDetached(edit)) recoverGoalRun(host as GoalRunStoreHost, context.session);
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
    if (activation.issue) return { kind: 'local', output: activation.issue };
    const result = await runSessionGoalCommand(args, commandContext, host, context.session);
    if (['pause', 'drop', 'complete'].includes(args[0]?.toLowerCase() ?? '') && readGoalEdit(host, context.session).goal?.phase !== 'active') pauseAdvisor(context, host);
    const scheduler = schedulerForContext(context);
    const parsed = parseGoalArgs(args);
    if (!scheduler || !parsed.ok) return result;
    const verb = parsed.action.name || (parsed.args.length ? 'set' : 'show');
    const goal = readGoalEdit(host, context.session).goal;
    if ((verb === 'set' || verb === 'resume') && goal?.phase === 'active' && result.output.startsWith(verb === 'set' ? 'Goal set.' : 'Goal resumed.')) {
      const issue = scheduler.start();
      return issue ? { ...result, output: `${result.output}\n${issue}` } : { ...result, output: `${result.output}\nAutomatic continuation scheduled.` };
    }
    if (['pause', 'drop', 'complete'].includes(verb) && goal?.phase !== 'active') await scheduler.stop('user');
    return result;
  };
}

/** Only the current bound goal reaches a newly submitted turn. */
export function goalObjectiveFor(context: ShellRuntimeContext, host: GoalStoreHost): string | undefined {
  if (prepareGoalSession(context, host).issue) return undefined;
  try { return goalObjective(readGoalEdit(host, context.session)); }
  catch { return undefined; }
}

export function goalPolicyFor(context: ShellRuntimeContext, host: GoalStoreHost): RequestPolicy | undefined {
  if (prepareGoalSession(context, host).issue) return { reserve: () => { throw new ModelAdmissionError('unavailable'); } };
  return collaborationPolicyFor(context, goalRequestPolicy(host, context.session, schedulerForContext(context)?.ownerToken()));
}

/** Only parsed control actions may bypass a busy prompt or an unanswered question. */
export function isGoalControl(text: string): boolean {
  const tokens = text.trim().split(/\s+/);
  if (!['/goal', ...goalCommandAliases.map(alias => `/${alias}`)].includes(tokens[0]?.toLowerCase() ?? '')) return false;
  const parsed = parseGoalArgs(tokens.slice(1));
  return parsed.ok && (['show', 'pause', 'drop', 'complete'].includes(parsed.action.name) || !parsed.action.name && !parsed.args.length);
}
