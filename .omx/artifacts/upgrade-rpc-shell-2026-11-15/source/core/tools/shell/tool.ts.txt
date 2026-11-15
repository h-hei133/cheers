import type { ToolDefinition } from '../../../tools/types.js';
import type { ExecutionService } from '../../../runtime/execution/types.js';
import { DEFAULT_COMMAND_TIMEOUT_MS, MAX_COMMAND_TIMEOUT_MS } from '../../../runtime/execution/commandTimeout.js';
import { startBackgroundCommand } from './background.js';
import { runCommandTool } from './foreground.js';

/** One shell capability for model tools and direct session commands. */
export function createShellToolDefinition(executionService: ExecutionService,
  options: { readonly combinedOutput?: boolean } = {}): ToolDefinition {
  return {
    name: 'bash',
    description: 'Execute shell commands, including Git operations. Plan mode permits classified inspection commands such as git branch --show-current and git rev-parse --show-toplevel. Git status, diff, log, and show require approval because repository configuration can run helpers. Set runInBackground for a command that outlives this turn; load taskWait/taskOutput/taskStop via tool_load to inspect or stop background jobs rather than sleeping.',
    argsSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command line to execute.' },
        timeout: { type: 'number',
          description: `Optional timeout in seconds. Foreground defaults to ${DEFAULT_COMMAND_TIMEOUT_MS / 1000} seconds; the maximum is ${MAX_COMMAND_TIMEOUT_MS / 1000}. Session-owned background jobs default to 300 seconds and accept 1–300 seconds; unbound legacy background callers refuse an explicit timeout.`,
        },
        runInBackground: { type: 'boolean',
          description: 'Start the command and return immediately instead of waiting for it. Use it for something that takes longer than this turn should be held open, then read it with taskOutput. The command keeps running if the turn ends.',
        },
      },
      required: ['command'],
    },
    async execute(args, context) {
      const command = typeof args.command === 'string' ? args.command : '';
      if (args.runInBackground === true) return startBackgroundCommand(command, context, args.timeout);
      return runCommandTool(executionService, command, context, args.timeout, options);
    },
  };
}
