import path from 'node:path';
import { readServiceConfig } from '../../collaboration/service/config.js';
import { startCollaborationService } from '../../collaboration/service/listener.js';
import type { CliProcessRunnerInput } from '../bootstrap/contract.js';

/** The explicit foreground mode is composed before agent/provider bootstrap. */
export async function runCollaborationServiceMode(input: CliProcessRunnerInput): Promise<boolean> {
  if (input.args[0] !== 'serve') return false;
  if (input.args.length !== 2 || !path.isAbsolute(input.args[1]!)) {
    input.writeError('Usage: cheers serve <absolute-private-config.json>. The version-1 config selects bind address, port, private state, account token hashes and TLS certificate/key references. HTTP is loopback only.');
    input.exit(2);
  }
  let service: Awaited<ReturnType<typeof startCollaborationService>>;
  try { service = await startCollaborationService(readServiceConfig(input.args[1]!)); }
  catch { input.writeError('Collaboration service could not start. Check private config, TLS, single-owner state and listener availability; no provider was loaded.'); input.exit(1); }
  input.writeOutput(`Collaboration service protocol 1 listening at ${service.origin}; authenticated principal ACL required.`);
  let stop: () => void;
  try { await new Promise<void>(resolve => { stop = resolve; input.process.once('SIGINT', stop); input.process.once('SIGTERM', stop); }); }
  finally { input.process.removeListener('SIGINT', stop!); input.process.removeListener('SIGTERM', stop!); await service.close(); }
  return true;
}
