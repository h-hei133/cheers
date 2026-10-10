import { runPreparedTool } from '../../turn/invoke.js';
import type { ToolDefinition, ToolExecutionContext, ToolExecutionResult } from '../../tools/types.js';
import type { SshComposition } from './model.js';
import { operationAdmission } from './authority.js';
import { display, profilePreview } from './projection.js';

export function preparedOperation(host: SshComposition, operation: string, preview: string,
  execute: (context: ToolExecutionContext) => Promise<ToolExecutionResult>, bindProfile = true): ToolDefinition {
  const admission = operationAdmission(host, bindProfile);
  return { name: 'ssh', description: 'Perform one explicit verified SSH operation with separate remote authority.', argsSchema: { type: 'object' },
    prepare: () => ({ targets: [], permissionArgs: { operation, remote: host.profile?.selection.host ?? 'not-selected' },
      previewKind: 'execution', preview: `${profilePreview(host.profile)}\n${display(preview, 24000)}`,
      execute: async context => {
        try { const refused = admission(); if (refused) return { success: false, error: refused, metadata: { status: 'unchanged' } };
          return await execute(context); }
        catch { return { success: false, error: 'SSH effect or publication could not be confirmed; inspect durable jobs. No automatic retry occurred.', metadata: { status: 'unverified' } }; }
      } }), resultAdmission: admission, execute: async () => ({ success: false, error: 'Prepared native SSH approval required.' }) };
}
export async function approveOperation(host: SshComposition, operation: string, preview: string,
  execute: (context: ToolExecutionContext) => Promise<ToolExecutionResult>, bindProfile = true): Promise<string> {
  const admission = operationAdmission(host, bindProfile); const options = host.gate('ssh');
  const result = await runPreparedTool(preparedOperation(host, operation, preview, execute, bindProfile), {}, { ...options, admission },
    host.pending?.signal, undefined, 'SSH operation', { eventKey: 'ssh' });
  return result.output;
}
