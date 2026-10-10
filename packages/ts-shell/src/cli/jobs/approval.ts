import { runPreparedTool } from '../../turn/invoke.js';
import type { ToolDefinition, ToolExecutionContext, ToolExecutionResult } from '../../tools/types.js';
import type { JobsComposition } from './model.js';
import { jobAdmission } from './authority.js';

export async function approved(host: JobsComposition, name: string, command: string, preview: string,
  execute: (context: ToolExecutionContext) => Promise<ToolExecutionResult>): Promise<string> {
  const admission = jobAdmission(host, name === 'task' ? 'task' : 'bash'); const gate = host.gate(name);
  const definition: ToolDefinition = { name, description: 'Operate one session-bound job.', argsSchema: { type: 'object' },
    prepare: () => ({ targets: [], permissionArgs: { command, runInBackground: true, ...(name === 'task' ? { prompt: command } : {}) }, previewKind: 'execution', preview,
      execute: context => { if (admission()) throw new Error('Job admission changed after approval.'); return execute(context); } }),
    execute: async () => ({ success: false, error: 'Prepared job approval required.' }), resultAdmission: admission };
  return (await runPreparedTool(definition, {}, { ...gate, background: host.registry, admission }, undefined, undefined, 'Job', { eventKey: 'jobs' })).output;
}
