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
import { commandGateFor, sourceAccessFor, sourceReaderFor } from '../data/access.js';
import { configurationAdmission } from '../../core/shell/configuration.js';
import { redactUnsafeReportText } from '../../core/security/reportText.js';
import { captureWorkspaceRoot } from '../../core/workspace/roots.js';
import type { ArchitecturePlan } from './architecture/plan.js';

interface RetainedProposal {
  readonly proposal: RuleProposal | ArchitecturePlan;
  readonly admission: () => string | undefined;
  readonly read: ReturnType<typeof sourceReaderFor>;
  status: 'proposal' | 'permission-pending' | 'blocked' | 'denied' | 'cancelled' | 'failed' | 'committed' | 'unknown';
}

/** Exact proposals belong to one startup/session; native patch receipts remain durable. */
export function ruleCommandsFor(context: ShellRuntimeContext, busy: () => boolean): (name: 'init' | 'rules', args: readonly string[], signal?: AbortSignal) => Promise<CommandExecutionResult> {
  const retained = new Map<string, RetainedProposal>();
  return async (name, args, signal) => {
    const parsed = parseSyntax(name === 'init' ? initSyntax : rulesSyntax, args);
    if (!parsed.ok) return { kind: 'local', output: 'Invalid /' + name + ' arguments: ' + parsed.reason };
    if (busy()) return { kind: 'local', output: 'Wait for the current turn before preparing or applying rules.', state: { status: 'blocked' } };
    try {
      if (parsed.action.name === 'apply') return await applyRule(context, parsed.args[0]!, retained, signal);
      signal?.throwIfAborted();
      const admission = configurationAdmission(context);
      const read = sourceReaderFor(context);
      if (name === 'init' && parsed.action.name === 'architecture') {
        const root = captureWorkspaceRoot(context.cwd, context.cwd, 'read');
        const { planArchitecture } = await import('./architecture/plan.js');
        const proposal = await planArchitecture(root.path, sourceAccessFor(context, signal), read, signal);
        const refused = admission(); if (refused) throw new Error(refused);
        const id = retain(retained, { proposal, admission, read, status: 'proposal' });
        return { kind: 'local', output: ['Architecture preview', ...proposal.files.map(file => file.path),
          redactUnsafeReportText(proposal.preview, undefined, 48_000), '',
          `Use /init apply ${id} to review and approve the complete patch.`].join('\n'),
          state: { status: 'proposal', proposalId: id, proofVerdict: 'not_reported' } };
      }
      const proposal = proposeRules(context.cwd, name === 'init' ? 'init' : 'feedback', parsed.args.join(' '), read);
      const refused = admission(); if (refused) throw new Error(refused);
      const id = retain(retained, { proposal, admission, read, status: 'proposal' });
      return { kind: 'local', output: ['Rule proposal preview', 'Proposal: ' + id, 'Target: ' + proposal.target, 'Expected content SHA-256: ' + proposal.sourceDigest,
        proposal.preview || '(No content would change.)', '', 'Review this exact diff, then /' + name + ' apply ' + id + ' to request ordinary approval. No write has run. Proposals expire when the session, workspace or startup changes.'].join('\n'),
        state: { status: 'proposal', proposalId: id, target: proposal.target, sourceDigest: proposal.sourceDigest, write: proposal.write } };
    } catch (error) {
      return { kind: 'local', output: 'Rule operation blocked or unverified: ' + redactUnsafeReportText(error instanceof Error ? error.message : 'Unavailable.', undefined, 1024), state: { status: 'blocked' } };
    }
  };
}

function retain(retained: Map<string, RetainedProposal>, item: RetainedProposal): string {
  for (const [key, value] of retained) if (value.admission()) retained.delete(key);
  if (retained.size >= 16) retained.delete(retained.keys().next().value!);
  const id = randomUUID();
  retained.set(id, item);
  return id;
}

async function applyRule(context: ShellRuntimeContext, id: string, retained: Map<string, RetainedProposal>, signal?: AbortSignal): Promise<CommandExecutionResult> {
  signal?.throwIfAborted();
  const selected = retained.get(id);
  if (!selected) throw new Error('The exact rule proposal is unavailable; generate a new preview.');
  if (['permission-pending', 'committed', 'unknown'].includes(selected.status)) throw new Error('The proposal is ' + selected.status + '; inspect its native receipt before requesting another write.');
  const { proposal, admission, read } = selected;
  const refused = admission(); if (refused) throw new Error(refused);
  const architecture = 'files' in proposal ? proposal : undefined;
  if ('write' in proposal && proposal.write === 'unchanged') return { kind: 'local', output: 'The rule preview contains no changes; no write was requested.', state: { status: 'unchanged', proposalId: id } };
  const gate = commandGateFor(context);
  if (!gate) throw new Error('The ordinary patch approval owner is unavailable.');
  const gateOptions = gate('apply_patch');
  const current = () => admission() ?? gateOptions.admission?.();
  const options = { ...gateOptions, admission: current };
  if ('write' in proposal) prepareRuleProposal(proposal, preparationContext('apply_patch', options));
  const args = 'files' in proposal ? proposal.args : rulePatchArguments(proposal, path.relative(context.cwd, proposal.target));
  const verifyArchitecture = architecture ? () => {
    architecture.verifySources();
    architecture.verifyDestinations();
  } : undefined;
  verifyArchitecture?.();
  selected.status = 'permission-pending';
  let refusal: 'blocked' | 'denied' | 'cancelled' | 'failed' | undefined;
  const nativePatch = createPatchToolDefinition(verifyArchitecture);
  const patch = { ...nativePatch, resultAdmission: current,
    ...(architecture ? { prepare(input: Record<string, unknown>, ctx: Parameters<NonNullable<typeof nativePatch.prepare>>[1]) {
      const prepared = nativePatch.prepare!(input, ctx);
      const expected = prepared.selections?.length;
      const verifySelection = (selection: readonly string[]) => {
        if (selection.length !== expected) throw new Error('Architecture setup requires approving the complete patch.');
        verifyArchitecture?.();
      };
      return { ...prepared,
        selectionInspection(selection: readonly string[]) {
          verifySelection(selection);
          return prepared.selectionInspection!(selection);
        },
        execute(actual: typeof ctx, selection?: readonly string[], approval?: { readonly revision?: string }) {
          verifySelection(selection ?? []);
          return prepared.execute(actual, selection, approval);
        },
      };
    } } : {}),
    onRefusal: (_args: unknown, _context: unknown, outcome: 'blocked' | 'denied' | 'cancelled' | 'failed') => { refusal = outcome; } };
  const result = await runPreparedTool(patch, args, options, signal, id, 'Rule patch', { eventKey: 'ruleProposalId' });
  const receipt = result.metadata?.operationId;
  selected.status = !result.isError && result.metadata?.status === 'committed' ? 'committed'
    : receipt || result.metadata?.status === 'unverified' ? 'unknown' : refusal ?? 'blocked';
  if (selected.status === 'committed') {
    try {
      const destinations = 'files' in proposal ? proposal.files.map(file => ({ target: path.join(context.cwd, file.path), after: file.after })) : [proposal];
      for (const { target, after } of destinations) {
        const actual = read(target, 256 * 1024);
        if (actual.state !== 'exists' || actual.content !== after || current()) selected.status = 'unknown';
      }
    }
    catch { selected.status = 'unknown'; }
  }
  return { kind: 'local', output: [result.output, 'Rule proposal ' + id + ': ' + selected.status + '.', receipt ? 'Native operation receipt: ' + receipt : 'No committed native receipt was observed.',
    selected.status === 'committed' ? architecture ? 'Configuration verified. Hook execution still requires ordinary project approval.' : 'Exact rule bytes were read back.'
      : 'Inspect the retained proposal and any native receipt before retrying.'].join('\n'),
    state: { status: selected.status, proposalId: id, operationId: receipt ?? null, verified: selected.status === 'committed',
      ...(architecture ? { proofVerdict: 'not_reported' } : {}) } };
}
