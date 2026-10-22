import { planVersion } from '../../../planning/plan/codec.js';
import { planReport, showPlan } from '../../../planning/plan/projection.js';
import { readPlan } from '../../../planning/plan/store.js';
import type { PlanDraft } from '../../../planning/plan/model.js';
import type { SessionManager } from '../../../session/SessionManager.js';
import type { CommandContext } from '../../../core/commands/types.js';
import type { Picker } from '../overlay.js';

/**
 * Read-only plan review with explicit one-step actions.
 *
 * Approval and rejection are delegated to the planning command owner; execution
 * is returned as an exact draft so the ordinary prompt path performs it. The
 * panel never turns a visual plan into write authority.
 */
export function planPicker(manager: SessionManager | undefined, context: CommandContext): Picker {
  if (!manager || !context.sessionId) {
    return {
      title: 'Plan review',
      form: 'panel',
      empty: '',
      loadError: 'Plan review requires a bound session runtime.',
      async load() { throw new Error('Plan review requires a bound session runtime.'); },
      async apply() { return undefined; },
    };
  }
  let plan: PlanDraft | undefined;
  let loadedVersion: string | undefined;
  const isCurrent = (): boolean => {
    try { return context.admission?.() === undefined; } catch { return false; }
  };
  const read = (): PlanDraft | undefined => {
    const session = manager.getSession(context.sessionId!);
    if (!session) throw new Error('The current session is unavailable.');
    plan = readPlan(manager, session).plan;
    return plan;
  };
  return {
    isCurrent,
    get title() {
      return plan ? `Plan review — ${plan.phase} ${planVersion(plan)}` : 'Plan review';
    },
    form: 'panel',
    empty: 'No plan draft is available.',
    loadError: 'The plan is unavailable or invalid.',
    footer: 'Enter reviews the exact version. Approval grants no write scope.',
    async load() {
      const current = read();
      loadedVersion = current ? planVersion(current) : undefined;
      if (!current) return [{ id: 'show', label: 'Show current plan', detail: 'No draft is available', disabled: true }];
      const version = planVersion(current);
      return [
        { id: 'show', label: 'Show plan', detail: `Exact version ${version}` },
        { id: 'approve', label: 'Approve exact version', detail: version, disabled: current.phase === 'approved' },
        { id: 'reject', label: 'Reject exact version', detail: version },
        { id: 'execute', label: 'Prepare execution draft', detail: `${version}; submit the command separately` },
      ];
    },
    async apply(ids) {
      if (ids.length !== 1 || !ids[0] || !isCurrent()) return undefined;
      const current = read();
      if (!current) return { note: 'No plan draft is available.' };
      if (loadedVersion !== planVersion(current)) {
        return { note: 'The plan changed after this review opened. Reopen /plan-review before acting on it.' };
      }
      if (ids[0] === 'show') return { report: planReport(current) };
      if (!['approve', 'reject', 'execute'].includes(ids[0])) return undefined;
      if (ids[0] === 'execute') return { draft: `/plan-review execute ${planVersion(current)}` };
      if (!context.planningCommand) return { note: 'Planning actions require a bound session runtime.' };
      const result = await context.planningCommand('plan-review', [ids[0], planVersion(current)], context);
      if (result.kind === 'local') return { report: result.report ?? planReport(current), note: result.report ? undefined : showPlan(current) };
      return { note: result.kind === 'prompt' ? result.notice ?? 'Plan action requires explicit submission.' : 'Plan action requires explicit submission.' };
    },
  };
}
