import type { ToolDefinition } from '../../tools/types.js';
import type { SshComposition } from './model.js';
import { preparedOperation } from './approval.js';
import { captureOrigin, operationAdmission } from './authority.js';
import { display } from './projection.js';
import { lifetimePreview, submitJob } from './lifetime.js';

export function remoteTool(host: SshComposition): ToolDefinition {
  const resultAdmission = operationAdmission(host);
  return { name: 'ssh', description: 'Submit a durable command to the explicitly verified remote workspace. Remote account OS rights and output limits apply. Local path permission does not approve remote execution. Unknown dispatches must be reconciled, never replayed.',
    resultAdmission,
    argsSchema: { type: 'object', additionalProperties: false, properties: { command: { type: 'string', minLength: 1, maxLength: 16384 } }, required: ['command'] },
    prepare: (args, context) => {
      const command = args.command as string; const origin = captureOrigin(host);
      if (!host.service || Buffer.byteLength(command) > 16384 || command.includes('\0')) throw new Error('SSH remote request is unavailable or invalid.');
      const admission = operationAdmission(host);
      const operation = preparedOperation(host, 'run', `Exact remote command:\n${display(command, 24000)}\nOrigin: ${display(origin)}\n${lifetimePreview(origin)}`, async current => {
        if (admission()) throw new Error('SSH authority changed.');
        return submitJob(host, command, origin, current);
      });
      return operation.prepare!({}, context);
    }, execute: async () => ({ success: false, error: 'Prepared native SSH approval required.' }) };
}
