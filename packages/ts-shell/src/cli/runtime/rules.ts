import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { CommandExecutionResult } from '../../core/commands/types.js';
import { parseSyntax } from '../../core/commands/syntax/parse.js';
import { initSyntax, rulesSyntax } from '../../core/commands/rules/syntax.js';
import { proposeRules, prepareRuleProposal, rulePatchArguments, type RuleProposal } from '../../workflow/rules/proposal.js';
import { createPatchToolDefinition } from '../../edit/patch/tool.js';
import { preparationContext } from '../../turn/preparation.js';
import { runPreparedTool } from '../../turn/invoke.js';
import { commandGateFor, sourceReaderFor } from '../data/access.js';
import { configurationAdmission } from '../../core/shell/configuration.js';
import { redactUnsafeReportText } from '../../core/security/reportText.js';

interface RetainedProposal {
  readonly proposal: RuleProposal;
  readonly admission: () => string | undefined;
  readonly read: ReturnType<typeof sourceReaderFor>;
  status: 'proposal' | 'permission-pending' | 'blocked' | 'denied' | 'cancelled' | 'failed' | 'committed' | 'unknown';
}

/** Exact proposals belong to one startup/session; native patch receipts remain durable. */
export function ruleCommandsFor(context: ShellRuntimeContext, busy: () => boolean): (name: 'init' | 'rules', args: readonly string[]) => Promise<CommandExecutionResult> {
  const retained = new Map<string, RetainedProposal>();
  return async (name, args) => {
    const parsed = parseSyntax(name === 'init' ? initSyntax : rulesSyntax, args);
    if (!parsed.ok) return { kind: 'local', output: 'Invalid /' + name + ' arguments: ' + parsed.reason };
    if (busy()) return { kind: 'local', output: 'Wait for the current turn before preparing or applying rules.', state: { status: 'blocked' } };
    try {
      if (parsed.action.name === 'apply') return await applyRule(context, parsed.args[0]!, retained);
      const admission = configurationAdmission(context);
      const read = sourceReaderFor(context);
      const proposal = proposeRules(context.cwd, name === 'init' ? 'init' : 'feedback', parsed.args.join(' '), read);
      const refused = admission(); if (refused) throw new Error(refused);
      const id = randomUUID();
      for (const [key, value] of retained) if (value.admission()) retained.delete(key);
      if (retained.size >= 16) retained.delete(retained.keys().next().value!);
      retained.set(id, { proposal, admission, read, status: 'proposal' });
      return { kind: 'local', output: ['Rule proposal preview', 'Proposal: ' + id, 'Target: ' + proposal.target, 'Expected content SHA-256: ' + proposal.sourceDigest,
        proposal.preview || '(No content would change.)', '', 'Review this exact diff, then /' + name + ' apply ' + id + ' to request ordinary approval. No write has run. Proposals expire when the session, workspace or startup changes.'].join('\n'),
        state: { status: 'proposal', proposalId: id, target: proposal.target, sourceDigest: proposal.sourceDigest, write: proposal.write } };
    } catch (error) {
      return { kind: 'local', output: 'Rule operation blocked or unverified: ' + redactUnsafeReportText(error instanceof Error ? error.message : 'Unavailable.', undefined, 1024), state: { status: 'blocked' } };
    }
  };
}

async function applyRule(context: ShellRuntimeContext, id: string, retained: Map<string, RetainedProposal>): Promise<CommandExecutionResult> {
  const selected = retained.get(id);
  if (!selected) throw new Error('The exact rule proposal is unavailable; generate a new preview.');
  if (['permission-pending', 'committed', 'unknown'].includes(selected.status)) throw new Error('The proposal is ' + selected.status + '; inspect its native receipt before requesting another write.');
  const { proposal, admission, read } = selected;
  const refused = admission(); if (refused) throw new Error(refused);
  if (proposal.write === 'unchanged') return { kind: 'local', output: 'The rule preview contains no changes; no write was requested.', state: { status: 'unchanged', proposalId: id } };
  const gate = commandGateFor(context);
  if (!gate) throw new Error('The ordinary patch approval owner is unavailable.');
  const current = () => admission() ?? gate('apply_patch').admission?.();
  const options = { ...gate('apply_patch'), admission: current };
  prepareRuleProposal(proposal, preparationContext('apply_patch', options));
  const args = rulePatchArguments(proposal, path.relative(context.cwd, proposal.target));
  selected.status = 'permission-pending';
  let refusal: 'blocked' | 'denied' | 'cancelled' | 'failed' | undefined;
  const patch = { ...createPatchToolDefinition(), resultAdmission: current,
    onRefusal: (_args: unknown, _context: unknown, outcome: 'blocked' | 'denied' | 'cancelled' | 'failed') => { refusal = outcome; } };
  const result = await runPreparedTool(patch, args, options, undefined, id, 'Rule patch', { eventKey: 'ruleProposalId' });
  const receipt = result.metadata?.operationId;
  selected.status = !result.isError && result.metadata?.status === 'committed' ? 'committed'
    : receipt || result.metadata?.status === 'unverified' ? 'unknown' : refusal ?? 'blocked';
  if (selected.status === 'committed') {
    try { const actual = read(proposal.target, 256 * 1024); if (actual.state !== 'exists' || actual.content !== proposal.after || current()) selected.status = 'unknown'; }
    catch { selected.status = 'unknown'; }
  }
  return { kind: 'local', output: [result.output, 'Rule proposal ' + id + ': ' + selected.status + '.', receipt ? 'Native operation receipt: ' + receipt : 'No committed native receipt was observed.',
    selected.status === 'committed' ? 'Exact rule bytes were read back.' : 'Inspect the retained proposal and any native receipt before retrying.'].join('\n'),
    state: { status: selected.status, proposalId: id, operationId: receipt ?? null, verified: selected.status === 'committed' } };
}
