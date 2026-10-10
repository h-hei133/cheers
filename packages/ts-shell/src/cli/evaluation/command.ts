import path from 'node:path';
import { sameValue } from '../../config/values.js';
import { captureEvaluation, assertSources } from '../../eval/workflow/assets.js';
import { assertEvaluationPlacement } from '../../eval/workflow/isolation.js';
import { EvaluationStore } from '../../eval/workflow/store.js';
import { inspectWorkspaceFile } from '../../edit/authority/state.js';
import { improveSyntax } from '../../core/commands/improve/syntax.js';
import { parseSyntax } from '../../core/commands/syntax/parse.js';
import { syntaxHelp } from '../../core/commands/syntax/projection.js';
import type { LocalCommandResult } from '../../core/commands/types.js';
import type { ToolDefinition } from '../../tools/types.js';
import { preparationContext } from '../../turn/preparation.js';
import { runPreparedTool } from '../../turn/invoke.js';
import { readBoundSessionState } from '../../session/store/bound.js';
import type { JobsComposition } from '../jobs/model.js';
import { jobAdmission } from '../jobs/authority.js';
import { report } from '../jobs/projection.js';
import { EvaluationOwner, liveEvaluations } from './owner.js';
import { evaluationProjection } from './projection.js';
import { evaluationCheck, evaluationTools } from './tools.js';

export const pendingEvaluations = new WeakMap<JobsComposition['context'], object>();
async function invoke(host: JobsComposition, tool: ToolDefinition, args: Record<string, unknown> = {}) {
  return runPreparedTool(tool, args, host.gate(tool.name === 'improve_start' ? 'task' : tool.name === 'improve_check' ? 'bash' : 'apply_patch'),
    host.runtime.getCurrentRunController()?.signal, undefined, 'Evaluation', { eventKey: 'evaluation' });
}
export async function startEvaluation(host: JobsComposition, name: string): Promise<string> {
  if (process.platform !== 'linux') throw new Error('Isolated evaluations currently require Linux.');
  if (pendingEvaluations.has(host.context)) throw new Error('Evaluation setup approval is already pending.');
  const scope = readBoundSessionState(host.manager, host.session).scope;
  const access = preparationContext('read', host.gate('read')).assertSourceAccess;
  const manifest = path.relative(scope.workspace.path, path.resolve(host.context.cwd, name));
  const captured = captureEvaluation(scope.workspace.path, manifest, access);
  assertEvaluationPlacement(scope.workspace.path, host.manager.getSessionDirPath(host.session.id), captured.frozen.executable.path);
  const parent = jobAdmission(host, 'task'); const token = {}; pendingEvaluations.set(host.context, token);
  const mode = host.runtime.getAgentMode(); const permission = host.runtime.getPermissionScope();
  let owner: EvaluationOwner | undefined;
  const admission = () => parent() ?? (pendingEvaluations.get(host.context) !== token ? 'Evaluation setup was cancelled.'
    : host.runtime.getAgentMode() !== mode || host.runtime.getPermissionScope() !== permission ? 'Evaluation mode or permission scope changed.' : undefined);
  const tool: ToolDefinition = { name: 'improve_start', description: 'Approve frozen evaluation setup; scoring and publication require separate approvals.',
    argsSchema: { type: 'object', properties: {}, additionalProperties: false }, resultAdmission: admission,
    prepare: () => ({ targets: [], permissionToolName: 'task', permissionArgs: { prompt: `Initialize evaluation from ${manifest}` },
      previewKind: 'execution', preview: report({ manifest, editable: captured.frozen.spec.editable, target: captured.frozen.spec.target,
        guardrails: captured.frozen.spec.guardrails, samples: captured.frozen.spec.samples.length, maxRounds: captured.frozen.spec.maxRounds,
        permission: 'Create isolated retained artifacts only; evaluator execution and original file publication require separate native approvals.' }),
      execute: async context => {
        context.abortSignal?.throwIfAborted(); if (admission()) throw new Error('Evaluation setup authority changed.');
        assertSources({ id: '', scope, frozen: captured.frozen, phase: 'creating', rounds: [] }, context.assertSourceAccess);
        const row = new EvaluationStore(host.manager, host.session).create(captured.frozen);
        owner = new EvaluationOwner(host, row); owner.initialize(captured);
        return { success: true, output: `Evaluation ${row.id} initialized. Baseline execution requires separate approval.`, metadata: { status: 'initialized' } };
      } }), execute: async () => ({ success: false, error: 'Prepared setup approval required.' }) };
  try {
    const result = await invoke(host, tool);
    if (result.isError || !owner) { owner?.cancel(); return result.output; }
    return result.output + '\n' + (await invoke(host, evaluationCheck(owner, 'baseline'))).output;
  } finally { if (pendingEvaluations.get(host.context) === token) pendingEvaluations.delete(host.context); }
}
export async function runEvaluationCommand(host: JobsComposition, args: readonly string[]): Promise<LocalCommandResult> {
  const parsed = parseSyntax(improveSyntax, args);
  if (!parsed.ok) return { kind: 'local', output: `Invalid /improve arguments: ${parsed.reason}\n${syntaxHelp(improveSyntax)}` };
  try {
    const action = parsed.action.name; const store = new EvaluationStore(host.manager, host.session);
    if (action === 'status') return { kind: 'local', output: report(store.read().runs.map(row => evaluationProjection(host, row))) };
    if (action === 'start') return { kind: 'local', output: await startEvaluation(host, parsed.args[0]!) };
    const owner = liveEvaluations.get(host.context);
    if (action === 'stop') {
      pendingEvaluations.delete(host.context);
      if (owner) { owner.retain(); return { kind: 'local', output: report(evaluationProjection(host, owner.row)) }; }
      const row = store.read().runs.find(row => ['creating', 'active', 'unknown'].includes(row.phase));
      if (row) store.change(row, { phase: 'retained' });
      return { kind: 'local', output: 'Evaluation authority revoked. Artifacts retained; previously dispatched cleanup is not inferred after restart.' };
    }
    if (!owner || owner.host !== host || owner.admission()) throw new Error('No live evaluation authority. Inspect /improve status; retained runs never replay.');
    if (action === 'check') return { kind: 'local', output: (await invoke(host, evaluationCheck(owner, owner.row.rounds.length ? 'candidate' : 'baseline'))).output };
    if (action === 'patch') {
      const source = inspectWorkspaceFile(owner.row.scope.workspace.path,
        path.relative(owner.row.scope.workspace.path, path.resolve(host.context.cwd, parsed.args[0]!)),
        preparationContext('read', host.gate('read')).assertSourceAccess, 1024 * 1024);
      if (source.state !== 'exists') throw new Error('Candidate patch file is missing.');
      return { kind: 'local', output: (await invoke(host, evaluationTools(owner).find(tool => tool.name === 'improve_patch')!, { patch: source.content })).output };
    }
    const before = owner.row; const checked = await invoke(host, evaluationCheck(owner, 'final'));
    if (checked.isError || owner.row.rounds.at(-1)?.verdict !== 'improved' || sameValue(before, owner.row)) return { kind: 'local', output: checked.output };
    const tool: ToolDefinition = { name: 'improve_publish', description: 'Approve exact final reevaluated file publication.',
      argsSchema: { type: 'object', properties: {}, additionalProperties: false }, resultAdmission: () => owner.row.phase === 'published' ? undefined : owner.admission(),
      prepare: (_args, context) => owner.preparePublish(context), execute: async () => ({ success: false, error: 'Prepared publication approval required.' }) };
    return { kind: 'local', output: (await invoke(host, tool)).output };
  } catch (error) { return { kind: 'local', output: report(error instanceof Error ? error.message : 'Evaluation refused or unverified. Inspect /improve status.') }; }
}
