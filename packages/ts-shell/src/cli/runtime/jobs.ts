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
import { AgentJournal } from '../../workflow/jobs/agent/journal.js';
import { AgentService } from '../../workflow/jobs/agent/service.js';
import type { AgentRuntimeInput } from '../jobs/agent/model.js';
import { settledWithin } from '../../workflow/jobs/settlement.js';
import { report } from '../jobs/projection.js';
import { DagJournal } from '../../workflow/jobs/dag/journal.js';
import { DagService } from '../../workflow/jobs/dag/service.js';
import { runDagCommand } from '../jobs/dag/command.js';

export function installJobsRuntime(context: ShellRuntimeContext, manager: SessionManager, runtime: ShellSessionRuntime,
  gate: (tool?: string) => ToolGateOptions, agentRuntimeInput?: AgentRuntimeInput): void {
  jobsInstallations.set(context, { manager, runtime, gate, hosts: new Map(), listeners: new Set(), retiring: new Set(), closing: false, agentRuntimeInput });
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
      const retired = Promise.all([previous.registry.close(), previous.agents.close(), previous.dags.close()])
        .then(() => Promise.all([previous.agents.drain(), previous.dags.drain()])).then(() => undefined).finally(() => installed.retiring.delete(retired));
      installed.retiring.add(retired);
    }
    const session = context.session; const jobs = new JobStore(installed.manager, () => session);
    const local = new LocalJournal(jobs, () => captureOrigin({ context, manager: installed.manager }),
      () => jobAdmission({ context, manager: installed.manager, session, gate: installed.gate }));
    host = { context, manager: installed.manager, runtime: installed.runtime, gate: installed.gate, session,
      jobs, local, registry: new TaskRegistry(undefined, local), agents: new AgentService(new AgentJournal(jobs)),
      dags: new DagService(new DagJournal(jobs)),
      agentRuntimeInput: installed.agentRuntimeInput }; installed.hosts.set(key, host);
    const selected = host;
    host.agents.onEnded(job => {
      if (context.session.id === session.id && jobsFor(context) === selected)
        installed.agentRuntimeInput?.notice?.(report(`Agent ${job.id} ${job.status}; inspect /jobs show ${job.id}.`));
    });
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
export function workflowCommandFor(context: ShellRuntimeContext): NonNullable<CommandContext['workflowCommand']> {
  return async (args, command) => {
    const host = jobsFor(context);
    return host && command.sessionId === host.session.id && command.cwd === context.cwd
      ? runDagCommand(host, args) : { kind: 'local', output: 'Workflows require the current bound session runtime.' };
  };
}
function unavailable(): never { throw new Error('The bound local job owner is unavailable; retry after cleanup settles.'); }
const unavailableRunner: BackgroundRunner = {
  start: unavailable, list: unavailable, get: unavailable, stop: async () => unavailable(), onEnded: unavailable,
};
export function jobsRunnerFor(context: ShellRuntimeContext): BackgroundRunner {
  return jobsFor(context)?.registry ?? unavailableRunner;
}
/** A profile handoff requires actual settlement, including inner bounded owners. */
async function drainJobs(host: JobsComposition): Promise<void> {
  const before = host.jobs.read();
  const selected = [
    ...(before.local ?? []).filter(job => host.registry.hasLive(job.id)).map(job => ({ id: job.id, kind: 'local' as const })),
    ...(before.agents ?? []).filter(job => host.agents.hasLive(job.id)).map(job => ({ id: job.id, kind: 'agents' as const })),
    ...(before.dags ?? []).filter(job => host.dags.hasLive(job.id)).map(job => ({ id: job.id, kind: 'dags' as const })),
  ];
  await Promise.all([host.registry.close(), host.agents.close(), host.dags.close()]);
  await Promise.all([host.agents.drain(), host.dags.drain()]);
  const after = host.jobs.read();
  for (const entry of selected) {
    const job = after[entry.kind]?.find(job => job.id === entry.id);
    if (!job || ['running', 'unknown'].includes(job.status)) throw new Error('Job cleanup or publication remains unverified.');
  }
}
export async function closeJobsFor(context: ShellRuntimeContext, requireDrained = false): Promise<void> {
  const installed = jobsInstallations.get(context); if (!installed) return;
  installed.closing = true;
  if (requireDrained) {
    const cleanup = Promise.all([...installed.retiring, ...[...installed.hosts.values()].map(drainJobs)]);
    if (!await settledWithin(cleanup)) throw new Error('Jobs did not complete a verified drain; profile switching is blocked.');
    jobsInstallations.delete(context); return;
  }
  await settledWithin(Promise.allSettled([...installed.retiring, ...[...installed.hosts.values()].flatMap(host => [host.registry.close(), host.agents.close(), host.dags.close()])]));
  jobsInstallations.delete(context);
}
