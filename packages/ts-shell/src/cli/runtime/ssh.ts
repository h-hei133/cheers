import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { ShellSessionRuntime } from '../../core/shell/sessionRuntime.js';
import type { SessionManager } from '../../session/SessionManager.js';
import type { CommandContext } from '../../core/commands/types.js';
import type { ToolGateOptions } from '../../turn/tools.js';
import { JobStore } from '../../workflow/jobs/store.js';
import { sshHosts } from '../ssh/state.js';
import { runSshCommand } from '../ssh/command.js';
import { remoteTool } from '../ssh/tool.js';
import { releaseParentJobs, cancelLocalOperations } from '../ssh/lifetime.js';

export function installSshRuntime(context: ShellRuntimeContext, manager: SessionManager, runtime: ShellSessionRuntime,
  gate: (tool?: string) => ToolGateOptions, report?: (message: string) => void): void {
  sshHosts.set(context, { context, manager, runtime, gate, report, operations: new Map(), submissions: new Set(), cancellationRevision: 0,
    jobs: new JobStore(manager, () => context.session) });
}
export function sshCommandFor(context: ShellRuntimeContext): NonNullable<CommandContext['sshCommand']> {
  return async (args, command) => {
    const host = sshHosts.get(context);
    if (!host || command.sessionId !== context.session.id || command.cwd !== context.cwd)
      return { kind: 'local', output: 'SSH session runtime is unavailable or changed.' };
    const action = args[0]?.toLowerCase() ?? 'status';
    if (['status', 'jobs', 'cancel-pending'].includes(action)) return runSshCommand(host, args, command);
    if (host.closing) return { kind: 'local', output: 'SSH binding is closing; wait for local settlement before another operation.' };
    if (host.pending && action !== 'disconnect') return { kind: 'local', output: 'Another SSH operation is pending; use /ssh cancel-pending to abort its local request.' };
    if (action === 'disconnect') host.pending?.abort();
    const pending = new AbortController(); host.pending = pending;
    try { return await runSshCommand(host, args, command); }
    finally { if (host.pending === pending) host.pending = undefined; }
  };
}
export function sshFeatureTools(context: ShellRuntimeContext) { const host = sshHosts.get(context); return host?.service ? [remoteTool(host)] : []; }
export function cancelSshFor(context: ShellRuntimeContext): void { const host = sshHosts.get(context); if (host) cancelLocalOperations(host); }
export async function closeSshFor(context: ShellRuntimeContext): Promise<void> {
  const host = sshHosts.get(context); if (!host) return;
  host.closing = true; cancelLocalOperations(host); host.client?.transport.abort();
  await releaseParentJobs(host); sshHosts.delete(context);
}
