import { rejectArguments } from './syntax/empty.js';
import type { CommandContext, LocalCommandResult } from './types.js';
import { restartRequest, type RestartPort, type RestartOutcome } from './restart/contract.js';

type RestartContext = CommandContext & { readonly restart?: RestartPort; readonly startupArgs?: readonly string[] };

/** Request controlled restart through the bootstrap owner; never claims a relaunch occurred. */
export async function runRestartCommand(args: string[], context: CommandContext): Promise<LocalCommandResult> {
  const invalid = rejectArguments('restart', args);
  if (invalid) return invalid;
  const input = context as RestartContext;
  if (!input.restart) return { kind: 'local', output: 'Restart unavailable: this session has no controlled restart owner.' };
  let outcome: RestartOutcome;
  try { outcome = await input.restart.request(restartRequest(input.startupArgs ?? process.argv.slice(2), context.sessionId)); }
  catch (error) { return { kind: 'local', output: `Restart failed before handoff: ${error instanceof Error ? error.message : String(error)}` }; }
  if (outcome.status === 'requested') return { kind: 'local', output: `Restart requested with ${outcome.request.argv.length} preserved startup argument(s). Bootstrap will drain resources and rebuild this runtime; recovery remains a separate startup result.` };
  return { kind: 'local', output: outcome.status === 'unavailable' ? `Restart unavailable: ${outcome.reason}` : `Restart failed: ${outcome.reason}` };
}
