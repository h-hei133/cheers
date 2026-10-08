import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { ShellSessionRuntime } from '../../core/shell/sessionRuntime.js';
import type { SessionManager } from '../../session/SessionManager.js';
import { GoalScheduler } from '../../planning/goal/run/scheduler.js';
import type { GoalSubmissionHost } from '../../planning/goal/run/model.js';
import { completeAcceptedGoal } from '../../planning/goal/acceptance/complete.js';
import { assertSourceAccess } from '../../core/query/sourcePolicy.js';

const contexts = new WeakMap<ShellRuntimeContext, GoalScheduler>();
const runtimes = new WeakMap<ShellSessionRuntime, GoalScheduler>();

/** The registry locates a host; durable goal/run state remains the scheduling authority. */
export function installGoalScheduler(context: ShellRuntimeContext, store: SessionManager, runtime: ShellSessionRuntime,
  report: (message: string) => void): GoalScheduler {
  const scheduler = new GoalScheduler({ store, current: () => context.session, cancel: () => runtime.cancelCurrentRun(), report,
    afterRoundSettled: session => {
      try { if (completeAcceptedGoal(store, session, absolute => assertSourceAccess(absolute, session.projectRoot,
        session.workspaceRoots, runtime.getPermissionScope(), context.runtimeConfig.denyRules))) report('Goal completed from approved criteria and verified runtime evidence.'); }
      catch { /* Unknown acceptance does not publish completion. */ }
    },
    host: { ready: () => runtime.getCurrentRunController() === null,
      submit: async (prompt, promptMetadata) => { await runtime.executePrompt(context.session.id, prompt, { promptMetadata, outputMode: 'print' }); } } });
  runtime.observeEvents(event => scheduler.observe(event), { renders: false });
  contexts.set(context, scheduler); runtimes.set(runtime, scheduler);
  return scheduler;
}

export function schedulerForContext(context: ShellRuntimeContext): GoalScheduler | undefined { return contexts.get(context); }
export function schedulerForRuntime(runtime: ShellSessionRuntime): GoalScheduler | undefined { return runtimes.get(runtime); }
export function attachGoalSubmission(runtime: ShellSessionRuntime, host: GoalSubmissionHost): (() => void) | undefined {
  return runtimes.get(runtime)?.attach(host);
}

/** A goal's unresolved drain stays durable when catchable process cleanup must return. */
export async function cancelGoalRunForShutdown(runtime: ShellSessionRuntime): Promise<void> {
  const scheduler = runtimes.get(runtime);
  if (scheduler?.ownerToken()) {
    await scheduler.stop('cancelled');
    if (scheduler.ownerToken()) return;
  }
  await runtime.cancelAndWait();
}
