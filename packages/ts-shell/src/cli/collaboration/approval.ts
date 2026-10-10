import { runPreparedTool } from '../../turn/invoke.js';
import type { ToolDefinition, ToolExecutionContext, ToolExecutionResult, ToolPreparation } from '../../tools/types.js';
import type { CollaborationComposition } from './model.js';
import { digest, requireValue } from '../../collaboration/contract/value.js';
import { currentBinding } from './projection.js';
import { UnknownMutation } from '../../collaboration/client/service.js';

/** Native approval binds captured payload, source, session and destination; no permission follows from a message. */
export async function approveOperation(host: CollaborationComposition, operation: string, preview: string,
  execute: (context: ToolExecutionContext) => Promise<ToolExecutionResult>, preparation?: Pick<ToolPreparation, 'targets'>): Promise<{ ok: boolean; output: string }> {
  const bound = digest(currentBinding(host)); const client = host.client; const options = host.gate();
  const admission = () => {
    try { host.pending?.signal.throwIfAborted(); requireValue(digest(currentBinding(host)) === bound, 'stale'); client?.profile.check(); return options.admission?.(); }
    catch { return 'Collaboration authority or source changed.'; }
  };
  const tool: ToolDefinition = { name: 'collaboration', description: 'Perform an explicitly previewed collaboration or local export operation.', argsSchema: { type: 'object' },
    prepare: () => ({ targets: preparation?.targets ?? [], ...(preparation ? {} : { permissionArgs: { path: client?.profile.origin ?? operation, operation } }),
      preview, previewKind: preparation ? 'file-plan' : 'execution', execute: async context => {
        const refusal = admission(); if (refusal) return { success: false, error: refusal, metadata: { status: 'unchanged' } };
        try { return await execute(context); }
        catch (error) { return { success: false, error: error instanceof UnknownMutation
          ? `Mutation outcome unknown; request ${error.requestId}. Query /collab receipt ${error.requestId}; do not resend automatically.`
          : 'Operation was refused or its effect could not be confirmed. Inspect the current host/guest state; no retry was performed.', metadata: { status: error instanceof UnknownMutation ? 'unknown' : 'unverified' } }; }
      } }), execute: async () => ({ success: false, error: 'Prepared native approval required.' }), resultAdmission: admission };
  const result = await runPreparedTool(tool, {}, { ...options, admission }, host.pending?.signal, undefined, 'Collaboration', { eventKey: 'collaboration' });
  return { ok: !result.isError, output: result.output };
}
