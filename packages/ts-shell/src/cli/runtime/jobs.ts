import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { ShellSessionRuntime } from '../../core/shell/sessionRuntime.js';
import type { SessionManager } from '../../session/SessionManager.js';
import type { ToolGateOptions } from '../../turn/tools.js';
import type { CommandContext } from '../../core/commands/types.js';
import { JobStore } from '../../workflow/jobs/store.js';
import { LocalJournal } from '../../workflow/jobs/local/journal.js';
import { TaskRegistry } from '../../workflow/jobs/local/registry.js';
import { jobsInstallations } from '../jobs/state.js';
import { captureOrigin } from '../jobs/origin.js';
import { jobAdmission } from '../jobs/authority.js';
import { runJobsCommand } from '../jobs/command.js';
import type { JobsComposition } from '../jobs/model.js';
import type { BackgroundRunner, BackgroundTask } from '../../workflow/jobs/local/model.js';
import { captureWorkspaceRoot } from '../../core/workspace/roots.js';

export function installJobsRuntime(context: ShellRuntimeContext, manager: SessionManager, runtime: ShellSessionRuntime,
  gate: (tool?: string) => ToolGateOptions): void {
  jobsInstallations.set(context, { manager, runtime, gate, hosts: new Map(), listeners: new Set(), retiring: new Set(), closing: false });
}
export function jobsFor(context: ShellRuntimeContext): JobsComposition | undefined {
  const installed = jobsInstallations.get(context); if (!installed || installed.closing) return undefined;
  const binding = captureWorkspaceRoot(context.session.projectRoot, context.session.projectRoot, 'read');
  const key = JSON.stringify([context.session.id, context.session.createdAt, binding.path, binding.identity]);
  let host = installed.hosts.get(key);
  if (!host) {
    if (installed.retiring.size >= 8) return undefined;
    for (const [previousKey, previous] of installed.hosts) {
      installed.hosts.delete(previousKey);
      const retired = previous.registry.close().finally(() => installed.retiring.delete(retired));
      installed.retiring.add(retired);
    }
    const session = context.session; const jobs = new JobStore(installed.manager, () => session);
    const local = new LocalJournal(jobs, () => captureOrigin({ context, manager: installed.manager }),
      () => jobAdmission({ context, manager: installed.manager, session, gate: installed.gate }));
    host = { context, manager: installed.manager, runtime: installed.runtime, gate: installed.gate, session,
      jobs, local, registry: new TaskRegistry(undefined, local) }; installed.hosts.set(key, host);
    const selected = host;
    host.registry.onEnded(task => {
      if (context.session.id !== session.id || jobsFor(context) !== selected) return;
      for (const listener of installed.listeners) listener(task);
    });
  }
  return host;
}
export function watchJobsFor(context: ShellRuntimeContext, listener: (task: BackgroundTask) => void): () => void {
  const installed = jobsInstallations.get(context); if (!installed) return () => {};
  installed.listeners.add(listener); return () => { installed.listeners.delete(listener); };
}
export function jobsCommandFor(context: ShellRuntimeContext): NonNullable<CommandContext['jobsCommand']> {
  return async (name, args, command) => {
    const host = jobsFor(context);
    return host && command.sessionId === host.session.id && command.cwd === context.cwd
      ? runJobsCommand(host, name, args, command) : { kind: 'local', output: 'Jobs require the current bound session runtime.' };
  };
}
function unavailable(): never { throw new Error('The bound local job owner is unavailable; retry after cleanup settles.'); }
const unavailableRunner: BackgroundRunner = {
  start: unavailable, list: unavailable, get: unavailable, stop: async () => unavailable(), onEnded: unavailable,
};
export function jobsRunnerFor(context: ShellRuntimeContext): BackgroundRunner {
  return jobsFor(context)?.registry ?? unavailableRunner;
}
export async function closeJobsFor(context: ShellRuntimeContext): Promise<void> {
  const installed = jobsInstallations.get(context); if (!installed) return;
  installed.closing = true;
  await Promise.allSettled([...installed.retiring, ...[...installed.hosts.values()].map(host => host.registry.close())]);
  jobsInstallations.delete(context);
}
