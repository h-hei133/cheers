import { runPreparedTool } from '../../turn/invoke.js';
import type { ToolDefinition, ToolExecutionContext, ToolExecutionResult } from '../../tools/types.js';
import type { SshComposition } from './model.js';
import { display, profilePreview } from './projection.js';

export function preparedOperation(host: SshComposition, operation: string, preview: string,
  execute: (context: ToolExecutionContext) => Promise<ToolExecutionResult>, admission: () => string | undefined, target?: string): ToolDefinition {
  const profile = host.profile;
  return { name: 'ssh', description: 'Perform one explicit verified SSH operation with separate remote authority.', argsSchema: { type: 'object' },
    prepare: () => ({ targets: [], permissionArgs: { operation, remote: profile?.selection.host ?? 'not-selected', ...(target === undefined ? {} : { command: target }) },
      previewKind: 'execution', preview: `${profilePreview(profile)}\n${display(preview, 24000)}`,
      execute: async context => {
        try { const refused = admission(); if (refused) return { success: false, error: refused, metadata: { status: 'unchanged' } };
          return await execute(context); }
        catch { return { success: false, error: 'SSH effect or publication could not be confirmed; inspect durable jobs. No automatic retry occurred.', metadata: { status: 'unverified' } }; }
      } }), resultAdmission: admission, execute: async () => ({ success: false, error: 'Prepared native SSH approval required.' }) };
}
export async function approveOperation(host: SshComposition, operation: string, preview: string,
  execute: (context: ToolExecutionContext) => Promise<ToolExecutionResult>, admission: () => string | undefined, target?: string): Promise<string> {
  const tool = preparedOperation(host, operation, preview, execute, admission, target);
  const signal = host.pending?.signal;
  const options = host.gate('ssh');
  const confirm = options.escalationPromptHandler;
  const fileApproval = target === undefined ? {} : {
    permissionScope: 'ask' as const,
    escalationPromptHandler: confirm && (async (prompt: Parameters<typeof confirm>[0]) => {
      prompt.context.explicitApproval = true;
      prompt.options = prompt.options.filter(option => option.value !== 'allow-always');
      prompt.title = display(prompt.title, 8000);
      prompt.message = display(prompt.message, 8000);
      prompt.context.target = display(prompt.context.target, 8000);
      const answer = await confirm(prompt);
      return answer.decision === 'allow-once' ? answer : { ...answer, decision: 'deny' as const };
    }),
  };
  const result = await runPreparedTool(tool, {}, { ...options, ...fileApproval, admission },
    signal, undefined, 'SSH operation', { eventKey: 'ssh' });
  return result.output;
}
