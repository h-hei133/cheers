import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { ShellSessionRuntime } from '../../core/shell/sessionRuntime.js';
import type { SessionManager } from '../../session/SessionManager.js';
import type { ToolGateOptions } from '../../turn/tools.js';
import type { CommandContext } from '../../core/commands/types.js';
import { collaborationHosts } from '../collaboration/state.js';
import { runCollaborationCommand } from '../collaboration/command.js';

export function installCollaborationRuntime(context: ShellRuntimeContext, manager: SessionManager, runtime: ShellSessionRuntime, gate: (tool?: string) => ToolGateOptions): void {
  const host = { context, manager, runtime, gate: () => gate('apply_patch'), proposals: [], accepted: new Map() };
  collaborationHosts.set(context, host);
}
export function collaborationCommandFor(context: ShellRuntimeContext): NonNullable<CommandContext['collaborationCommand']> {
  return async (name, args, command) => {
    const host = collaborationHosts.get(context);
    if (!host || command.sessionId !== context.session.id || command.cwd !== context.cwd) return { kind: 'local', output: 'Collaboration session runtime is unavailable or changed.' };
    if (host.pending) return { kind: 'local', output: 'Another collaboration decision is pending.' };
    host.pending = new AbortController();
    try { return await runCollaborationCommand(host, name, args, command); }
    finally { host.pending = undefined; }
  };
}
export function cancelCollaborationFor(context: ShellRuntimeContext): void {
  collaborationHosts.get(context)?.pending?.abort();
}
export async function closeCollaborationFor(context: ShellRuntimeContext): Promise<void> {
  const host = collaborationHosts.get(context); if (!host) return;
  host.pending?.abort(); host.guest?.close();
  try { await host.host?.close(); } finally { host.client?.close(); collaborationHosts.delete(context); }
}
