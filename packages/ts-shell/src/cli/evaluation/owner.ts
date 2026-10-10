import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { sameValue } from '../../config/values.js';
import { createDefaultExecutionService } from '../../runtime/execution/service.js';
import { inspectWorkspaceFile } from '../../edit/authority/state.js';
import { prepareOperation, commitOperation, EditOperationError } from '../../edit/recovery/operation/write.js';
import { planPatch } from '../../edit/patch/plan.js';
import { parsePatch } from '../../edit/patch/parse.js';
import type { ToolExecutionContext, ToolPreparation } from '../../tools/types.js';
import { assertSources, assertFixedSources, evaluationDigest, evaluationFiles, seedEvaluation, type captureEvaluation } from '../../eval/workflow/assets.js';
import { EvaluationStore } from '../../eval/workflow/store.js';
import { compareEvaluation } from '../../eval/workflow/scoring.js';
import { measureEvaluation, EvaluationExecutionError } from '../../eval/workflow/runner.js';
import type { Evaluation, EvaluationRound } from '../../eval/workflow/model.js';
import type { JobsComposition } from '../jobs/model.js';
import { jobAdmission } from '../jobs/authority.js';

export const liveEvaluations = new WeakMap<JobsComposition['context'], EvaluationOwner>();
export class EvaluationOwner {
  row: Evaluation;
  private readonly parent: () => string | undefined;
  private revoked = false;
  private uncertain = false;
  private busy = false;
  private controller?: AbortController;
  private readonly mode: ReturnType<JobsComposition['runtime']['getAgentMode']>;
  private readonly permission: ReturnType<JobsComposition['runtime']['getPermissionScope']>;
  readonly store: EvaluationStore;
  constructor(readonly host: JobsComposition, row: Evaluation) {
    this.row = row; this.store = new EvaluationStore(host.manager, host.session); this.parent = jobAdmission(host);
    this.mode = host.runtime.getAgentMode(); this.permission = host.runtime.getPermissionScope();
  }
  admission = (): string | undefined => {
    if (this.revoked || this.uncertain || liveEvaluations.get(this.host.context) !== this || this.row.phase !== 'active') return 'No live evaluation authority. Inspect /improve status; retained runs never replay.';
    if (this.host.runtime.getAgentMode() !== this.mode || this.host.runtime.getPermissionScope() !== this.permission) return 'Evaluation mode or permission scope changed.';
    try { return this.parent() ?? (!sameValue(this.store.read().runs.find(row => row.id === this.row.id), this.row) ? 'Evaluation state changed.' : undefined); }
    catch { return 'Evaluation publication is unavailable.'; }
  };
  initialize(captured: ReturnType<typeof captureEvaluation>): void {
    try {
      assertSources(this.row); const parent = path.join(this.host.manager.getSessionDirPath(this.host.session.id), 'evaluations');
      fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
      const directory = seedEvaluation(path.join(parent, this.row.id), captured);
      this.row = this.store.change(this.row, { directory, phase: 'active' }); liveEvaluations.set(this.host.context, this);
    } catch (error) { this.uncertain = true; throw new Error('Evaluation setup is unverified; artifacts were retained. Inspect /improve status.', { cause: error }); }
  }
  cancel(): void { this.revoked = true; this.controller?.abort(); }
  get running(): boolean { return this.busy; }
  retain(): void {
    if (this.busy) { this.cancel(); throw new Error('Evaluation cancellation requested; wait for native cleanup, then retain it.'); }
    this.cancel(); this.row = this.store.change(this.row, { phase: 'retained' }); liveEvaluations.delete(this.host.context);
  }
  async evaluate(kind: EvaluationRound['kind'], context: ToolExecutionContext): Promise<EvaluationRound> {
    const blocked = this.admission(); if (blocked) throw new Error(blocked);
    if (this.busy || this.row.rounds.at(-1)?.status === 'running' || this.row.rounds.some(round => round.status === 'unknown')) throw new Error('A running or unknown evaluation cannot be replayed.');
    if (this.row.rounds.length >= this.row.frozen.spec.maxRounds) throw new Error('Evaluation round budget exhausted; candidate retained.');
    if (kind !== 'baseline' && this.row.rounds[0]?.verdict !== 'baseline' || kind === 'baseline' && this.row.rounds.length)
      throw new Error('A complete frozen baseline is required before candidate scoring.');
    assertSources(this.row, context.assertSourceAccess);
    const round: EvaluationRound = { id: randomUUID(), kind, digest: evaluationDigest(this.row, kind === 'baseline' ? 'baseline' : 'candidate'),
      status: 'running', measurements: [], startedAt: Date.now() };
    this.row = this.store.change(this.row, { rounds: [...this.row.rounds, round] }); this.busy = true;
    const controller = new AbortController(); this.controller = controller; const abort = () => controller.abort();
    context.abortSignal?.addEventListener('abort', abort, { once: true }); if (context.abortSignal?.aborted) abort();
    let current = round;
    try {
      await measureEvaluation(this.row, round, createDefaultExecutionService(), controller.signal, this.admission, measurement => {
        current = { ...current, measurements: [...current.measurements, measurement] }; this.saveRound(current);
      });
      assertSources(this.row, context.assertSourceAccess); if (this.admission()) throw new Error('Evaluation authority changed before settlement.');
      current = { ...current, status: 'completed', verdict: kind === 'baseline' ? 'baseline' : compareEvaluation(this.row.frozen.spec, this.row.rounds[0]!, current.measurements) };
      this.saveRound(current); return current;
    } catch (error) {
      const status = error instanceof EvaluationExecutionError ? error.status : controller.signal.aborted ? 'cancelled' : 'failed';
      try { this.saveRound({ ...current, status }); } catch { this.uncertain = true; }
      if (status === 'unknown') this.uncertain = true;
      throw new Error(`Evaluation ${this.uncertain ? 'unknown' : status}; no improvement or publication proved. Candidate retained.`);
    } finally { this.busy = false; this.controller = undefined; context.abortSignal?.removeEventListener('abort', abort); }
  }
  private saveRound(round: EvaluationRound): void {
    this.row = this.store.change(this.row, { rounds: [...this.row.rounds.slice(0, -1), round] });
  }
  preparePatch(patch: string, context: ToolExecutionContext): ToolPreparation {
    if (this.admission() || this.busy || this.row.rounds[0]?.verdict !== 'baseline') throw new Error('A live completed baseline is required for isolated edits.');
    assertSources(this.row, context.assertSourceAccess); const digest = evaluationDigest(this.row, 'candidate'); const expected = this.row;
    const root = path.join(this.row.directory!.path, 'candidate');
    if (parsePatch(patch).some(operation => operation.kind !== 'update' || !this.row.frozen.spec.editable.includes(operation.path)))
      throw new Error('Only declared existing candidate files may be updated. Evaluator, samples and context are immutable.');
    const plan = planPatch(patch, { sessionId: this.host.session.id, workspaceRoot: root });
    if (!plan.files.length || plan.files.some(file => !this.row.frozen.spec.editable.includes(file.relativePath) || file.rename || file.content === undefined
      || file.before.state !== 'exists')) throw new Error('Only declared existing candidate files may be updated. Evaluator, samples and context are immutable.');
    for (const file of plan.files) context.assertFileAccess?.(path.join(this.row.scope.workspace.path, file.relativePath));
    return { targets: plan.files.map(file => ({ path: path.join(this.row.scope.workspace.path, file.relativePath), operation: 'write' })),
      preview: `Isolated candidate edit ${this.row.id}; original files remain the publication targets.\n${patch}`,
      execute: async execution => {
        if (!sameValue(expected, this.row)) throw new Error('The prepared evaluation changed after approval.');
        this.assertIdle(digest, execution); const prepared = await prepareOperation({ sessionId: this.host.session.id, workspaceRoot: this.row.scope.workspace.path,
          callId: execution.taskId, correlationId: execution.correlationId }, plan.files.map(file => ({ ...file,
            assertFileAccess: () => {
              execution.abortSignal?.throwIfAborted(); if (this.admission()) throw new Error('Candidate edit authority was revoked.');
              assertSources(this.row, execution.assertSourceAccess); execution.assertFileAccess?.(path.join(this.row.scope.workspace.path, file.relativePath));
            } })));
        this.assertIdle(digest, execution);
        try {
          const receipt = commitOperation(prepared, { compensate: true });
          return { success: true, output: `Candidate edit committed; evaluation is required. Source unchanged. Operation ${receipt.operationId}.`,
            metadata: { status: receipt.status, operationId: receipt.operationId, evaluationId: this.row.id } };
        } catch (error) {
          const status = error instanceof EditOperationError ? error.status : 'unknown'; this.uncertain = ['partial', 'unknown'].includes(status);
          return { success: false, output: `Candidate edit ${status}; inspect its operation receipt. Source unchanged.`,
            metadata: { status, ...(error instanceof EditOperationError ? { operationId: error.operationId } : {}) } };
        }
      } };
  }
  preparePublish(context: ToolExecutionContext): ToolPreparation {
    const final = this.row.rounds.at(-1);
    if (final?.kind !== 'final' || final.status !== 'completed' || final.verdict !== 'improved') throw new Error('A complete improved final reevaluation is required before publication.');
    this.assertIdle(final.digest, context); const expected = this.row;
    const files = evaluationFiles(this.row, 'candidate').filter(file => this.row.frozen.spec.editable.includes(file.name)).map(file => {
      const before = inspectWorkspaceFile(this.row.scope.workspace.path, file.name, context.assertFileAccess, 1024 * 1024);
      return { workspaceRoot: this.row.scope.workspace.path, workspaceIdentity: this.row.scope.workspace.identity, relativePath: file.name,
        before, content: file.state.content, mode: file.state.mode & 0o777, assertFileAccess: context.assertFileAccess };
    }).filter(file => file.before.state === 'exists' && file.before.content !== file.content);
    if (!files.length) throw new Error('The improved candidate has no file changes to publish.');
    return { targets: files.map(file => ({ path: path.join(file.workspaceRoot, file.relativePath), operation: 'write' })),
      preview: `Publish exact reevaluated candidate ${this.row.id}, digest ${final.digest}.\n` + files.map(file =>
        `--- ${file.relativePath}\n${file.before.state === 'exists' ? file.before.content : ''}\n+++\n${file.content}`).join('\n'),
      execute: async execution => {
        if (!sameValue(expected, this.row)) throw new Error('The approved final evaluation changed.');
        this.assertIdle(final.digest, execution);
        const prepared = await prepareOperation({ sessionId: this.host.session.id, workspaceRoot: this.row.scope.workspace.path,
          callId: execution.taskId, correlationId: execution.correlationId }, files.map(file => ({ ...file,
            assertFileAccess: absolute => {
              this.assertPublication(final.digest, execution);
              execution.assertFileAccess?.(absolute);
            } })));
        this.assertIdle(final.digest, execution);
        let operationId: string | undefined;
        try {
          const receipt = commitOperation(prepared, { compensate: true });
          operationId = receipt.operationId;
          if (receipt.status !== 'committed') throw new EditOperationError(receipt.operationId, receipt.status);
          this.assertPublication(final.digest, execution);
          for (const file of files) {
            const current = inspectWorkspaceFile(file.workspaceRoot, file.relativePath, execution.assertSourceAccess, 1024 * 1024);
            if (current.state !== 'exists' || current.content !== file.content || (current.mode & 0o777) !== file.mode)
              throw new Error('Published source changed before final settlement.');
          }
          this.row = this.store.change(this.row, { phase: 'published', operationId: receipt.operationId }); this.cancel(); liveEvaluations.delete(this.host.context);
          return { success: true, output: `Reevaluated candidate published with operation ${receipt.operationId}.`, metadata: { status: 'committed', operationId: receipt.operationId } };
        } catch (error) {
          this.uncertain = true;
          return { success: false, output: `Publication ${error instanceof EditOperationError ? error.status : 'unknown'}; inspect the edit receipt and /improve status. Candidate retained.`,
            metadata: { status: error instanceof EditOperationError ? error.status : 'unknown',
              ...(error instanceof EditOperationError ? { operationId: error.operationId } : operationId ? { operationId, publication: 'committed' } : {}) } };
        }
      } };
  }
  private assertPublication(digest: string, context: ToolExecutionContext): void {
    context.abortSignal?.throwIfAborted(); const blocked = this.admission(); if (blocked) throw new Error(blocked);
    if (this.busy || evaluationDigest(this.row, 'candidate') !== digest) throw new Error('Approved candidate changed or evaluation is busy.');
    assertFixedSources(this.row, context.assertSourceAccess);
  }
  private assertIdle(digest: string, context: ToolExecutionContext): void {
    context.abortSignal?.throwIfAborted(); const blocked = this.admission(); if (blocked) throw new Error(blocked);
    if (this.busy || evaluationDigest(this.row, 'candidate') !== digest) throw new Error('Approved candidate changed or evaluation is busy.');
    assertSources(this.row, context.assertSourceAccess);
    for (const name of this.row.frozen.spec.editable) context.assertFileAccess?.(path.join(this.row.scope.workspace.path, name));
  }
}
