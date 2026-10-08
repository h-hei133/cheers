import type { CommandContext, LocalCommandResult } from './types.js';

/** The CLI supplies the session goal owner; off-session callers cannot write project state. */
export async function runGoalCommand(args: string[], context: CommandContext): Promise<LocalCommandResult> {
  return context.goalCommand ? context.goalCommand(args, context)
    : { kind: 'local', output: 'Session goal management is unavailable without a session host.' };
}
