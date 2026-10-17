import type { CliProcessRunnerInput } from '../contract.js';
import { freshExecutable } from './invocation.js';
import { launchProfileSwitch } from './handoff.js';
import type { SwitchTicket } from './model.js';

/** The old shutdown owner has already drained; signals now belong to the fresh child. */
export async function runProfileSwitch(ticket: SwitchTicket, input: CliProcessRunnerInput): Promise<void> {
  const controller = new AbortController();
  const stop = () => controller.abort();
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) input.process.on(signal, stop);
  try {
    const outcome = await launchProfileSwitch(ticket, { executable: freshExecutable(input.process.execPath, input.process.argv[1]),
      env: input.process.env, signal: controller.signal });
    if (outcome.status === 'verified') input.writeOutput(`Profile target startup was read back in fresh session ${outcome.sessionId}; its process has now exited.`);
    else { input.writeError(`Profile switch outcome is unknown. Inspect operation ${ticket.operation}; the source session remains available for explicit resume.`); input.exit(1); }
  } finally {
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) input.process.off(signal, stop);
  }
}
