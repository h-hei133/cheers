import type { Interface as ReadlineInterface } from 'node:readline';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { PromptRun, ShellSessionRuntime } from '../../core/shell/sessionRuntime.js';
import type { RuntimeConfig } from '../../config/runtimeConfig.js';
import type { StreamingRenderer } from '../../presentation/terminal/streaming.js';
import type { CommandContext } from '../../core/commands/types.js';
import type { SessionManager } from '../../session/SessionManager.js';
import { readGoalEdit, writeGoal } from '../../planning/goal/store.js';
import { runPlanCommand } from '../../planning/plan/command.js';
import { runGuidanceCommand } from '../../planning/goal/guidance/command.js';
import { schedulerForRuntime } from './goalScheduling.js';
import { assertSourceAccess } from '../../core/query/sourcePolicy.js';
import { capturePlan } from '../../planning/plan/capture.js';
import { completeAcceptedGoal } from '../../planning/goal/acceptance/complete.js';

export function planningCommandFor(context: ShellRuntimeContext, store: SessionManager, runtime: ShellSessionRuntime,
  readline?: ReadlineInterface): NonNullable<CommandContext['planningCommand']> {
  return async (name, args, commandContext) => {
    try {
      if (commandContext.sessionId !== context.session.id || commandContext.projectRoot !== context.projectRoot) {
        return { kind: 'local', output: 'Planning refused: the current session changed.' };
      }
      const preview = (args[0] === 'show' || name === 'plan-review' && !args.length);
      if (!preview && runtime.getCurrentRunController()) return { kind: 'local', output: 'Planning update refused: wait for active work to settle.' };
      const beforeChange = async (): Promise<void> => {
        if (runtime.getCurrentRunController()) throw new Error('Active work must settle before planning changes.');
        const edit = readGoalEdit(store, context.session);
        if (edit.goal?.phase === 'active') {
          await schedulerForRuntime(runtime)?.stop('user');
          const latest = readGoalEdit(store, context.session);
          if (latest.goal?.phase === 'active') writeGoal(store, context.session, latest, { type: 'pause' });
        }
      };
      if (name === 'guided-goal') return await runGuidanceCommand(args, commandContext, store, context.session, readline, beforeChange);
      return await runPlanCommand(name, args, commandContext, store, context.session, { beforeChange, setMode: mode => runtime.setAgentMode(mode) });
    } catch (error) {
      return { kind: 'local', output: `Planning update unverified or refused: ${error instanceof Error ? error.message : 'state unavailable'}` };
    }
  };
}
export function isPlanningControl(text: string): boolean {
  return /^\/(?:guided-goal\s+(?:show|cancel)|plan\s+show|plan-review(?:\s+show)?)\s*$/i.test(text.trim());
}
/** Pipe controls contain only local actions; preview/execute prompts stay in the ordinary queue. */
export function isPlanningStreamControl(text: string): boolean {
  return /^\/(?:guided-goal(?:\s|$)|plan\s+(?:show|set|check|artifact|remove)(?:\s|$)|plan-review(?:\s+(?:show|approve|reject)(?:\s|$)|\s*$))/i.test(text.trim());
}

/** The normal session writer settles first; only then may persisted drafts or acceptance advance. */
export function planningSettlement(store: SessionManager, sessionId: string, promptEntryId: string | undefined,
  runtime: ShellSessionRuntime, config: Pick<RuntimeConfig, 'denyRules'>, renderer: StreamingRenderer): NonNullable<Extract<PromptRun, { readonly events: unknown }>['settled']> {
  return outcome => {
    if (outcome.status !== 'completed' || !promptEntryId) return;
    try {
      const current = store.getSession(sessionId);
      if (current && capturePlan(store, current, promptEntryId, outcome.finalOutput)) {
        renderer.renderLine('Plan draft saved for exact review with /plan-review.');
      }
    } catch { renderer.renderLine('Plan draft publication is unverified. Review or stage a new draft explicitly.'); }
    try {
      const current = store.getSession(sessionId);
      if (current && completeAcceptedGoal(store, current, absolute => assertSourceAccess(absolute,
        current.projectRoot, current.workspaceRoots, runtime.getPermissionScope(), config.denyRules))) {
        renderer.renderLine('Goal completed from the exact approved criteria and verified runtime evidence.');
      }
    } catch { /* Missing/stale evidence leaves acceptance unverified. */ }
  };
}
