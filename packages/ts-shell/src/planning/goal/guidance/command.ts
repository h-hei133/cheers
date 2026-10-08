import type { Interface as ReadlineInterface } from 'node:readline';
import type { CommandContext, LocalCommandResult } from '../../../core/commands/types.js';
import { guidedGoalSyntax, parsePlanningArgs } from '../../../core/commands/planning/syntax.js';
import { planningBody } from '../../../core/commands/planning/source.js';
import { syntaxHelp } from '../../../core/commands/syntax/projection.js';
import { redactExportText } from '../../../core/security/redaction.js';
import type { Session } from '../../../session/schema/sessionRecord.js';
import type { BoundSessionHost } from '../../../session/store/bound.js';
import { PlanError } from '../../plan/model.js';
import { guidanceFields, type GuidanceField } from './model.js';
import { createGuidance, answerGuidance, validAnswer } from './state.js';
import { readGuidance, writeGuidance, approveGuidance, validateGuidanceApproval } from './store.js';
import { showGuidance } from './projection.js';
import { askGuidance, cancelGuidanceQuestion } from './question.js';

export async function runGuidanceCommand(args: string[], context: CommandContext, host: BoundSessionHost,
  session: Session, readline?: ReadlineInterface, beforeChange: () => Promise<void> = async () => {}): Promise<LocalCommandResult> {
  const parsed = parsePlanningArgs(guidedGoalSyntax, args);
  if (!parsed.ok) return { kind: 'local', output: `Invalid /guided-goal arguments: ${parsed.reason}\n${syntaxHelp(guidedGoalSyntax)}` };
  let edit = readGuidance(host, session); const action = parsed.action.name;
  if (action === 'show') return { kind: 'local', output: showGuidance(edit.draft) };
  if (action === 'approve') {
    if (edit.draft && Object.values(edit.draft.answers).some(answer => redactExportText(answer!) !== answer)) throw new PlanError('unapproved');
    validateGuidanceApproval(edit, parsed.args[0]!); await beforeChange();
    edit = approveGuidance(host, session, edit, parsed.args[0]!);
    return { kind: 'local', output: `Guided goal approved as paused.\n${showGuidance(edit.draft)}` };
  }
  if (action === 'cancel') {
    if (edit.draft?.phase === 'approved') return { kind: 'local', output: `This draft already created paused goal ${edit.draft.approval!.goalId}. Use /goal drop to abandon that goal explicitly.` };
    await beforeChange();
    if (readline) cancelGuidanceQuestion(readline);
    if (edit.draft?.phase === 'draft') edit = writeGuidance(host, session, edit, { ...edit.draft, phase: 'cancelled', updatedAt: new Date().toISOString() });
    return { kind: 'local', output: 'Guided goal draft cancelled; no goal was created or activated.' };
  }
  if (action === 'answer') {
    if (!edit.draft) throw new PlanError('unavailable');
    const next = answerGuidance(edit.draft, parsed.args[0] as GuidanceField, planningBody(context.rawCommandArgs, 2, parsed.args.slice(1)));
    await beforeChange(); edit = writeGuidance(host, session, edit, next);
    return { kind: 'local', output: showGuidance(edit.draft) };
  }
  const objective = planningBody(context.rawCommandArgs, 0, parsed.args);
  await beforeChange();
  edit = writeGuidance(host, session, edit, createGuidance(edit.bound.scope, objective));
  if (context.interactive !== false && readline) {
    for (const field of guidanceFields) {
      if (edit.draft!.answers[field]) continue;
      const answer = await askGuidance(readline, field);
      if (!validAnswer(answer)) break;
      edit = writeGuidance(host, session, edit, answerGuidance(edit.draft!, field, answer));
    }
  }
  return { kind: 'local', output: showGuidance(readGuidance(host, session).draft) };
}
