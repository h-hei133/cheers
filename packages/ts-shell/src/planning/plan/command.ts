import { randomUUID } from 'node:crypto';
import type { CommandContext, CommandExecutionResult } from '../../core/commands/types.js';
import { parsePlanningArgs, planReviewSyntax, planSyntax } from '../../core/commands/planning/syntax.js';
import { planningBody, criterionCommand } from '../../core/commands/planning/source.js';
import { syntaxHelp } from '../../core/commands/syntax/projection.js';
import { redactExportText } from '../../core/security/redaction.js';
import { decodeGoal } from '../goal/codec.js';
import { goalDefinition } from '../goal/acceptance/definition.js';
import type { Session } from '../../session/schema/sessionRecord.js';
import type { BoundSessionHost } from '../../session/store/bound.js';
import { PlanError, type PlanCriterion } from './model.js';
import { planVersion, textDigest } from './codec.js';
import { createPlan, editPlan, reviewPlan } from './state.js';
import { readPlan, writePlan } from './store.js';
import { showPlan } from './projection.js';

export interface PlanCommandHost {
  beforeChange(): Promise<void>;
  setMode(mode: 'plan' | 'build'): void;
  approve?(version: string): void;
}
export async function runPlanCommand(name: 'plan' | 'plan-review', args: string[], context: CommandContext,
  host: BoundSessionHost, session: Session, runtime: PlanCommandHost): Promise<CommandExecutionResult> {
  const syntax = name === 'plan' ? planSyntax : planReviewSyntax; const parsed = parsePlanningArgs(syntax, args);
  if (!parsed.ok) return { kind: 'local', output: `Invalid /${name} arguments: ${parsed.reason}\n${syntaxHelp(syntax)}` };
  let edit = readPlan(host, session); const action = parsed.action.name;
  if (action === 'show') return { kind: 'local', output: showPlan(edit.plan) };
  const goal = decodeGoal(edit.bound.state.goal);
  if (edit.bound.state.goal !== undefined && !goal) throw new PlanError('invalid');
  const goalBinding = goal && !['complete', 'dropped'].includes(goal.phase) ? { id: goal.id, definitionDigest: goalDefinition(goal) } : undefined;
  if (name === 'plan-review') {
    if (!edit.plan) throw new PlanError('unavailable');
    if (JSON.stringify(edit.plan.goal) !== JSON.stringify(goalBinding)) throw new PlanError('stale');
    if (action === 'approve' && [edit.plan.text, ...edit.plan.criteria.map(criterion => criterion.kind === 'command' ? criterion.command : criterion.path)]
      .some(text => redactExportText(text) !== text)) throw new PlanError('unapproved');
    const plan = reviewPlan(edit.plan, action as 'approve' | 'reject' | 'execute', parsed.args[0]!);
    await runtime.beforeChange();
    edit = writePlan(host, session, edit, plan);
    if (action === 'approve') runtime.approve?.(planVersion(plan));
    if (action !== 'execute') return { kind: 'local', output: showPlan(edit.plan) };
    runtime.setMode('build');
    return { kind: 'prompt', prompt: `Execute this explicitly approved plan through the ordinary tools and permission gates. Approval grants no tool write scope.\nPlan version: ${planVersion(plan)}\n${plan.text}\n${showPlan(plan)}`,
      promptMetadata: { source: 'plan-execution', planVersion: planVersion(plan) }, notice: 'Executing the exact approved plan; tool permissions are required separately.' };
  }
  if (!action) {
    const task = planningBody(context.rawCommandArgs, 0, parsed.args);
    await runtime.beforeChange(); runtime.setMode('plan');
    if (!task.trim()) return { kind: 'local', output: `Read-only plan mode enabled.\n${showPlan(edit.plan)}` };
    return { kind: 'prompt', prompt: `Prepare a plan preview for the following task. Inspect as needed; do not write or execute implementation. The user must review and explicitly approve a draft before execution.\n${task}`,
      promptMetadata: { source: 'plan-draft', planRequest: { id: randomUUID(), previousVersion: edit.plan ? planVersion(edit.plan) : null,
        scope: edit.bound.scope, ...(goalBinding ? { goal: goalBinding } : {}) } }, notice: 'Preparing a draft in read-only plan mode.' };
  }
  let next;
  if (action === 'set') {
    const text = planningBody(context.rawCommandArgs, 1, parsed.args);
    next = edit.plan && JSON.stringify(edit.plan.goal) === JSON.stringify(goalBinding)
      ? editPlan(edit.plan, { text }) : createPlan(edit.bound.scope, text, goalBinding);
  } else {
    if (!edit.plan) throw new PlanError('unavailable');
    if (JSON.stringify(edit.plan.goal) !== JSON.stringify(goalBinding)) throw new PlanError('stale');
    next = action === 'remove' ? editPlan(edit.plan, { remove: parsed.args[0] })
      : editPlan(edit.plan, { criterion: criterion(action, parsed.args, parsed.flags, parsed.values, context.rawCommandArgs) });
  }
  await runtime.beforeChange(); edit = writePlan(host, session, edit, next); runtime.setMode('plan');
  return { kind: 'local', output: showPlan(edit.plan) };
}
function criterion(action: string, args: readonly string[], flags: ReadonlyMap<string, string | true>,
  values: ReadonlyMap<string, readonly (string | true)[]>, raw?: string): PlanCriterion {
  const id = randomUUID(); const implementation = flags.get('implementation') === true;
  if (action === 'artifact') return { id, kind: 'artifact', path: args[0]!, expected: args[1]!, implementation };
  const command = criterionCommand(raw); const targets = values.get('target');
  if (!command?.trim() || !Array.isArray(targets) || !targets.length || !targets.every(target => typeof target === 'string')) throw new PlanError('invalid');
  return { id, kind: 'command', command, commandDigest: textDigest(command), targets: targets as readonly string[], implementation };
}
