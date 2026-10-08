import path from 'node:path';
import { validateToolArguments } from '../../core/tools/arguments.js';
import { neutraliseForDisplay } from '../../core/text/safety.js';
import { editDiff } from '../result/diff.js';
import type { ToolDefinition, ToolExecutionContext, ToolExecutionResult } from '../../tools/types.js';
import { EditOperationError } from '../recovery/operation/write.js';
import { readOperation } from '../recovery/operation/store.js';
import { applyPatchPlan } from './batch.js';
import { planPatch } from './plan.js';
import { patchLimits } from './parse.js';
import { hashContent } from '../authority/content.js';

export function createPatchToolDefinition(): ToolDefinition {
  return {
    name: 'apply_patch',
    description: 'Apply one approved text patch across files as one recorded operation. Use exact *** Begin Patch / *** End Patch, Add File (+ lines), Delete File, or Update File (@@ exact unique context, +/-/space lines; optional Move to and End of File). Renames stay in one workspace and never overwrite. Partial/unknown outcomes remain visible; no cross-file crash atomicity.',
    argsSchema: { type: 'object', properties: { input: { type: 'string', maxLength: patchLimits.inputBytes },
      expectedHashes: { type: 'object', description: 'Optional exact SHA-256 source snapshots from a language edit proposal. All updated source files must match.', additionalProperties: { type: 'string' } } }, required: ['input'], additionalProperties: false },
    prepare(args, context) {
      validateToolArguments(this.argsSchema, args);
      if (!context.sessionId) throw new Error('A saved session is required for a recorded patch.');
      const root = context.artifactRoot ?? context.workspaceRoot;
      const plan = planPatch(args.input as string, { ...context, sessionId: context.sessionId, workspaceRoot: root });
      if (args.expectedHashes !== undefined) {
        if (!args.expectedHashes || typeof args.expectedHashes !== 'object' || Array.isArray(args.expectedHashes)) throw new Error('Patch source hashes are invalid.');
        const expected = args.expectedHashes as Record<string, unknown>;
        const sources = plan.files.filter(file => file.before.state === 'exists');
        if (Object.keys(expected).length !== sources.length || sources.some(file => {
          const digest = expected[path.join(file.workspaceRoot, file.relativePath)];
          return typeof digest !== 'string' || !/^[0-9a-f]{64}$/.test(digest) || file.before.state !== 'exists' || hashContent(file.before.content) !== digest;
        })) throw new Error('FILE_CONTENT_CHANGED: Patch source snapshots no longer match the proposal.');
      }
      const targets = Object.freeze(plan.files.map(file => Object.freeze({ path: path.join(file.workspaceRoot, file.relativePath), operation: file.content === undefined ? 'delete' as const : 'write' as const })));
      const preview = ['Patch plan', `Revision: ${plan.revision}`, ...plan.files.map(file => {
        const before = file.before.state === 'exists' ? file.before.content : '';
        return `${file.content === undefined ? 'Delete' : file.rename ? 'Rename endpoint' : file.before.state === 'absent' ? 'Add' : 'Update'}: ${JSON.stringify(path.join(file.workspaceRoot, file.relativePath))}\n${editDiff(file.relativePath, before, file.content ?? '')}`;
      }), 'Files commit separately. A later failure may require guarded compensation.'].join('\n\n');
      if (Buffer.byteLength(preview) > patchLimits.previewBytes) throw new Error('Patch preview is too large; split the operation before requesting approval.');
      return Object.freeze({ targets, preview, execute: async (actual: ToolExecutionContext) => {
        try {
          const receipt = await applyPatchPlan(plan, { sessionId: actual.sessionId!, workspaceRoot: actual.artifactRoot ?? actual.workspaceRoot,
            callId: actual.taskId, correlationId: actual.correlationId }, actual);
          return receipt ? projectResult(receipt) : { success: true, output: 'Patch contains no changes. No edit operation was recorded.' };
        } catch (error) {
          if (error instanceof EditOperationError) {
            try { return projectResult(readOperation(plan.scope, error.operationId), error.status); }
            catch { return { success: false, error: `Patch ${error.operationId}: unknown. Inspect the operation receipt before retrying.`, metadata: { operationId: error.operationId, status: 'unknown' } }; }
          }
          return { success: false, error: error instanceof Error ? error.message : 'Patch preflight failed.' };
        }
      } });
    },
    async execute() { throw new Error('Patch requires its original prepared and approved call.'); },
  };
}

function projectResult(receipt: import('../recovery/operation/model.js').OperationReceipt, status = receipt.status): ToolExecutionResult {
  const files = receipt.files.map(file => ({ path: path.join(file.workspace.path, file.path), status: file.status,
    compensation: file.compensation ?? 'none' }));
  const lines = files.map(file => `${JSON.stringify(file.path)}: ${file.status}${file.compensation === 'none' ? '' : `, compensation ${file.compensation}`}`);
  return { success: status === 'committed', output: `Patch ${receipt.operationId}: ${status}.\n${lines.map(neutraliseForDisplay).join('\n')}`,
    metadata: { operationId: receipt.operationId, status, files, rollbackAtomicityClaim: false } };
}
