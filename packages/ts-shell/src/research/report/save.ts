import path from 'node:path';
import type { ToolDefinition, ToolExecutionContext, ToolExecutionResult } from '../../tools/types.js';
import { createPatchToolDefinition } from '../../edit/patch/tool.js';
import type { ResearchRuntime } from '../run/runtime.js';
import { boundRun, runEvent, updateRun } from '../run/state.js';
import { researchReportDigest } from '../run/prompts.js';
import { createProcessOwner } from '../../core/state/owner.js';
import { savedOperationOutcome } from './recovery.js';

export function researchSaveTool(runtime: ResearchRuntime, runId: string): ToolDefinition {
  const schema = { type: 'object', additionalProperties: false, required: ['runId', 'path'],
    properties: { runId: { const: runId }, path: { type: 'string', minLength: 1, maxLength: 4096 } } };
  return { name: 'research_save', description: 'Prepare the complete current native research report as one exclusive new file. Truncated projections are refused. Requires ordinary write permission and an unchanged run. Existing files are never overwritten; only an actual committed edit receipt counts as saved. Content is native; do not pass model prose.', argsSchema: schema,
    onRefusal(args, context, outcome) {
      if (args.runId !== runId) return;
      const run = runtime.current();
      if (!run || run.id !== runId || run.sessionId !== context.sessionId || run.workspace.path !== context.workspaceRoot
        || ['committed', 'unknown'].includes(run.save.status) || run.save.status === 'pending' && run.save.path || run.owner) return;
      const binding = runtime.binding();
      updateRun(binding, current => runEvent({ ...current, save: { ...current.save,
        status: outcome === 'denied' ? 'denied' : 'failed' } }, 'stopped', `Native report save ${outcome}; no target operation was dispatched.`));
    },
    prepare(args, context) {
      if (args.runId !== runId || typeof args.path !== 'string' || /[\r\n\0]/.test(args.path)) throw new Error('Research save arguments are invalid.');
      const captured = runtime.saveBinding(runId);
      if (context.sessionId !== captured.run.sessionId || context.workspaceRoot !== captured.run.workspace.path) throw new Error('Research save session or workspace changed.');
      const target = path.resolve(captured.run.workspace.path, args.path);
      const relative = path.relative(captured.run.workspace.path, target);
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Research save requires a new file inside the bound workspace.');
      const report = runtime.reportProjection();
      if (report.truncated) throw new Error('The native report projection is truncated; saving an incomplete report is refused.');
      const content = report.text;
      const patch = `*** Begin Patch\n*** Add File: ${relative}\n${content.split('\n').map(line => `+${line}`).join('\n')}\n*** End Patch`;
      const prepared = createPatchToolDefinition().prepare!({ input: patch }, context);
      return Object.freeze({ ...prepared, execute: async (
        actual: ToolExecutionContext,
        selection?: readonly string[],
        approval?: { readonly revision?: string },
      ): Promise<ToolExecutionResult> => {
        const current = boundRun(captured.binding);
        if (current.revision !== captured.run.revision || current.epoch !== captured.run.epoch
          || researchReportDigest(current) !== captured.digest || runtime.selected(runId)?.epoch !== current.epoch) throw new Error('Research report changed after save preparation.');
        const owner = createProcessOwner();
        let pending = updateRun(captured.binding, run => ({ ...run, owner,
          save: { requested: true, status: 'pending', path: target, callId: actual.taskId } }));
        const assert = () => {
          const run = boundRun(captured.binding);
          if (run.revision !== pending.revision || run.epoch !== pending.epoch || researchReportDigest(run) !== captured.digest
            || runtime.selected(runId)?.epoch !== run.epoch) throw new Error('Research save authority changed before publication.');
        };
        let result: ToolExecutionResult;
        try { assert(); result = await prepared.execute({ ...actual,
          onEditOperationPrepared: operationId => {
            assert();
            pending = updateRun(captured.binding, run => ({ ...run, save: { ...run.save, operationId } }));
            actual.onEditOperationPrepared?.(operationId);
          },
          assertFileAccess: absolute => { assert(); actual.assertFileAccess?.(absolute); } }, selection, approval); }
        catch { result = { success: false, error: 'Research save failed before a verified committed receipt. Inspect the edit operation before retrying.', metadata: { status: 'unknown' } }; }
        const receiptOutcome = savedOperationOutcome(pending);
        const committed = result.success && result.metadata?.status === 'committed'
          && result.metadata.operationId === pending.save.operationId && receiptOutcome === 'committed';
        const status = committed ? 'committed' : receiptOutcome === 'failed' || !pending.save.operationId && result.metadata?.status === undefined ? 'failed' : 'unknown';
        try {
          updateRun(captured.binding, run => {
            // Record the original operation's factual outcome even after a pause;
            // the pause phase/epoch stay authoritative for any new work.
            if (run.owner?.token !== owner.token || run.save.path !== target) throw new Error('Research save outcome binding changed.');
            return runEvent({ ...run, owner: undefined, save: { ...pending.save, status } }, committed ? 'saved' : 'stopped',
              committed ? 'Report file committed by the native edit operation.' : 'Report save did not produce a committed receipt.');
          });
        } catch { return { ...result, success: false, error: 'File operation outcome returned, but research save state could not be confirmed.', metadata: { ...result.metadata, researchSave: 'unknown' } }; }
        return { ...result, success: committed, metadata: { ...result.metadata, researchSave: status } };
      } });
    }, async execute() { throw new Error('Research save requires its original prepared and approved file plan.'); } };
}
