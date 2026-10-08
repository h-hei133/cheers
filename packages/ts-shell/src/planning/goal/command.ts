import { parseGoalArgs, goalSyntax } from '../../core/commands/goal/syntax.js';
import { syntaxHelp } from '../../core/commands/syntax/projection.js';
import type { CommandContext, LocalCommandResult } from '../../core/commands/types.js';
import { readProjectState } from '../../core/state/projectState.js';
import type { Session } from '../../session/schema/sessionRecord.js';
import { GoalWriteError, type GoalAction } from './model.js';
import { readGoalEdit, writeGoal, goalIsDetached, type GoalStoreHost } from './store.js';
import { showGoal } from './projection.js';

export async function runSessionGoalCommand(args: string[], context: CommandContext,
  host: GoalStoreHost, session: Session): Promise<LocalCommandResult> {
  const parsed = parseGoalArgs(args);
  if (!parsed.ok) return local(`Invalid /goal arguments: ${parsed.reason}\n${syntaxHelp(goalSyntax)}`);
  if (context.sessionId !== session.id || context.projectRoot !== session.projectRoot) return local('Goal update refused: the current session changed.');
  const verb = parsed.action.name || (parsed.args.length ? 'set' : 'show');
  try {
    const baseline = readGoalEdit(host, session);
    if (verb === 'show') return local(showGoal(baseline, readProjectState(session.projectRoot).goal));
    const replaceTerminal = (verb === 'set' || verb === 'import') && (baseline.goal?.phase === 'complete' || baseline.goal?.phase === 'dropped');
    if (goalIsDetached(baseline) && verb !== 'drop' && !replaceTerminal) return local('Goal is detached from the current session/workspace. Use /goal drop before setting a new goal.');
    if ((verb === 'set' || verb === 'import') && baseline.goal && baseline.goal.phase !== 'complete' && baseline.goal.phase !== 'dropped') {
      return local('This session already has an unfinished goal. Use /goal drop or /goal complete before setting another.');
    }
    if (verb === 'resume' && (baseline.goal?.phase === 'complete' || baseline.goal?.phase === 'dropped')) return local('A completed or dropped goal cannot resume. Use /goal set for a new goal.');
    const action = commandAction(verb, parsed.args, session);
    if (!action) return local('No legacy project objective is available to import.');
    const saved = writeGoal(host, session, baseline, action);
    if (!saved.goal) return local('No goal set for this session. Use /goal set <objective>.');
    return local(`${resultNotice(verb)}\n${showGoal(saved)}`);
  } catch (error) {
    return local(errorNotice(error));
  }
}

function commandAction(verb: string, args: readonly string[], session: Session): GoalAction | undefined {
  if (verb === 'set') return { type: 'set', objective: args.join(' ') };
  if (verb === 'import') {
    const legacy = readProjectState(session.projectRoot).goal;
    return legacy ? { type: 'import', objective: legacy.objective } : undefined;
  }
  if (verb === 'complete') return { type: 'complete', source: 'user-declared' };
  if (verb === 'budget') {
    if (args[0] === 'off') return { type: 'budget' };
    if (!/^(0|[1-9][0-9]*)$/.test(args[0] ?? '') || !Number.isSafeInteger(Number(args[0]))) throw new GoalWriteError('invalid');
    return { type: 'budget', cap: Number(args[0]) };
  }
  if (verb === 'pause' || verb === 'resume' || verb === 'drop') return { type: verb };
  throw new GoalWriteError('invalid');
}

function resultNotice(verb: string): string {
  if (verb === 'budget') return 'Goal token budget saved. Existing usage and unresolved requests are retained.';
  if (verb === 'import') return 'Legacy description imported as paused. Use /goal resume explicitly to activate it.';
  if (verb === 'complete') return 'Goal recorded as user-declared complete.';
  if (verb === 'drop') return 'Goal abandoned; its identity and description are retained.';
  return `Goal ${verb === 'set' ? 'set' : verb === 'resume' ? 'resumed' : 'paused'}.`;
}

function errorNotice(error: unknown): string {
  if (error instanceof GoalWriteError && error.state === 'persisted') return 'Goal state was saved, but session lock cleanup failed. Reopen the session before another goal update.';
  if (error instanceof GoalWriteError && error.state === 'unknown') return 'Goal update was attempted, but persistence is unverified. Reopen the session before retrying.';
  if (error instanceof GoalWriteError && error.code === 'conflict') return 'Goal update refused because the session, workspace or goal changed. Reopen the session and inspect /goal show.';
  return 'Goal update was not saved. The session or goal state is unavailable or invalid.';
}

function local(output: string): LocalCommandResult { return { kind: 'local', output }; }
