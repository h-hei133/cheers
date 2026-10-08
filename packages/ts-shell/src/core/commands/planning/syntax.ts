import type { CommandSyntax } from '../syntax/model.js';
import { parseSyntax } from '../syntax/parse.js';

const version = { name: 'version', kind: 'text' as const, required: true };
const text = { name: 'text', kind: 'text' as const, rest: true, required: true };
export const planSyntax: CommandSyntax = {
  name: 'plan', defaultAction: '', actions: [
    { name: '', summary: 'enter read-only plan mode and prepare a draft', parameters: [{ ...text, name: 'task', required: false }] },
    { name: 'show', summary: 'show the current plan draft without executing' },
    { name: 'set', summary: 'stage literal plan text for review', parameters: [text] },
    { name: 'check', summary: 'stage an exact command criterion with explicit target coverage', parameters: [{ ...text, name: 'command' }],
      flags: [{ name: 'target', kind: 'text', repeatable: true, summary: 'artifact covered by this check' },
        { name: 'implementation', kind: 'boolean', summary: 'require a matching committed session edit for the covered targets' }] },
    { name: 'artifact', summary: 'stage an exact file hash or verified absence criterion', parameters: [
      { name: 'path', kind: 'text', required: true }, { name: 'sha256-or-absent', kind: 'text', required: true }],
      flags: [{ name: 'implementation', kind: 'boolean', summary: 'require a matching committed session edit' }] },
    { name: 'remove', summary: 'remove a draft criterion and invalidate its approval', parameters: [{ name: 'criterion-id', kind: 'text', required: true }] },
  ],
};
export const planReviewSyntax: CommandSyntax = { name: 'plan-review', defaultAction: 'show', actions: [
  { name: 'show', summary: 'review the exact current plan version' },
  { name: 'approve', summary: 'approve only this plan version; grants no write scope', parameters: [version] },
  { name: 'reject', summary: 'reject this plan version', parameters: [version] },
  { name: 'execute', summary: 'explicitly execute a previously approved exact plan version', parameters: [version] },
] };
export const guidedGoalSyntax: CommandSyntax = { name: 'guided-goal', defaultAction: '', actions: [
  { name: '', summary: 'clarify a rough objective before preparing a paused goal', parameters: [{ ...text, name: 'rough-objective', required: false }] },
  { name: 'show', summary: 'show answered and unanswered fields' },
  { name: 'answer', summary: 'stage an explicit answer; optional budget accepts N or off', parameters: [{ name: 'field', kind: 'text', required: true,
    values: ['objective', 'outcome', 'constraints', 'budget'] }, text] },
  { name: 'approve', summary: 'approve an exact fully answered draft as a paused goal', parameters: [version] },
  { name: 'cancel', summary: 'cancel the draft without creating or activating a goal' },
] };
export const queueSyntax: CommandSyntax = { name: 'queue', defaultAction: '', actions: [
  { name: '', summary: 'list pending execution or queue literal text', parameters: [{ ...text, required: false }] },
  { name: 'list', summary: 'list actual pending IDs, stages and execution order' },
  { name: 'add', summary: 'queue text for the ordinary execution path', parameters: [text] },
  { name: 'edit', summary: 'edit an undelivered entry', parameters: [{ name: 'id', kind: 'text', required: true }, text] },
  { name: 'move', summary: 'move within the same execution stage', parameters: [{ name: 'id', kind: 'text', required: true },
    { name: 'before-id-or-end', kind: 'text', required: true }] },
  { name: 'cancel', summary: 'remove an undelivered entry', parameters: [{ name: 'id', kind: 'text', required: true }] },
] };

/** Reserved verbs are strict; literal bodies remain available through set/add and --. */
export function parsePlanningArgs(syntax: CommandSyntax, args: readonly string[]) {
  if (!syntax.actions.some(action => action.name === '')) return parseSyntax(syntax, args);
  const recognized = syntax.actions.some(action => action.name && action.name === args[0]?.toLowerCase());
  return parseSyntax(syntax, recognized ? args : ['', ...args]);
}
