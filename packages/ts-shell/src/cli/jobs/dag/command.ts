import { workflowSyntax } from '../../../core/workflow/syntax.js';
import { readWorkflow } from '../../../core/workflow/definition.js';
import { DAGResolver } from '../../../core/workflow/dagResolver.js';
import { parseSyntax } from '../../../core/commands/syntax/parse.js';
import { syntaxHelp } from '../../../core/commands/syntax/projection.js';
import { renderList } from '../../../core/commands/workflowCommandRuntime.js';
import type { LocalCommandResult } from '../../../core/commands/types.js';
import type { JobsComposition } from '../model.js';
import { approved } from '../approval.js';
import { captureOrigin } from '../origin.js';
import { report } from '../projection.js';
import { captureDagRuntime, workflowFileAccess } from './runtime.js';
import { dagProjection } from './projection.js';
import type { JobOrigin } from '../../../workflow/jobs/contract.js';

export async function runDagCommand(host: JobsComposition, args: readonly string[]): Promise<LocalCommandResult> {
  const parsed = parseSyntax(workflowSyntax, args);
  if (!parsed.ok) return { kind: 'local', output: `Invalid /workflow arguments: ${parsed.reason}\n${syntaxHelp(workflowSyntax)}` };
  const action = parsed.action.name;
  try {
    if (action === 'list') return { kind: 'local', output: report(renderList(host.context.cwd, workflowFileAccess(host))) };
    if (action === 'status') return { kind: 'local', output: report(host.dags.journal.list().map(job => dagProjection(host, job))) };
    if (action === 'run' || action === 'queue') {
      const loaded = readWorkflow(host.context.cwd, parsed.args[0]!, workflowFileAccess(host));
      if ('error' in loaded) return { kind: 'local', output: report(loaded.error) };
      const graph = DAGResolver.resolve(loaded.workflow.steps.map(step => ({ id: step.id, name: step.id, dependencies: step.needs, status: 'pending' })));
      if (!graph.isValid) return { kind: 'local', output: report(graph.errorMessage) };
      const runtime = captureDagRuntime(host, loaded.workflow); const refused = runtime.admission();
      if (refused) return { kind: 'local', output: report(refused) };
      const origin = captureOrigin(host);
      const output = await approved(host, 'task', `Schedule workflow ${loaded.workflow.name}`, report({ definition: loaded.workflow,
        batches: graph.executionBatches, maxConcurrency: Math.min(loaded.workflow.maxConcurrency, 2),
        permission: 'Approve scheduling only. Every command still needs its ordinary bash approval.', restart: 'After a verified restart, only undispatched commands can run.' }),
      async () => {
        const refused = runtime.admission();
        return refused ? { success: false, output: report(refused) } : { success: true,
          output: report(dagProjection(host, host.dags.create(loaded.workflow, origin, runtime, action === 'queue'))) };
      });
      return { kind: 'local', output };
    }
    return { kind: 'local', output: await dagControl(host, action, parsed.args) };
  } catch { return { kind: 'local', output: 'Workflow operation refused or unverified. Inspect /workflow status. Dispatched commands are never replayed.' }; }
}
export async function dagControl(host: JobsComposition, action: string, args: readonly string[]): Promise<string> {
  const job = host.dags.journal.get(args[0]!);
  if (action === 'show') return report(dagProjection(host, job));
  if (action === 'resume') {
    const restart = job.dispatchPossible ? host.dags.resumePlan(job) : undefined;
    if (job.dispatchPossible && !restart) return 'Workflow restart is unavailable. Unconfirmed or halted commands never resume or replay.';
    if (restart && !matchesResumeParent(host, job.origin)) return 'Workflow restart requires the original active parent.';
    const runtime = captureDagRuntime(host, job.definition, job.directory); const refused = runtime.admission(); if (refused) return report(refused);
    return approved(host, 'task', `Resume workflow ${job.definition.name}`, report({ id: job.id, definition: job.definition,
      ...(restart ? { confirmed: restart.completed, pending: restart.pending } : {}),
      permission: 'Fresh scheduling approval. Remaining commands still require ordinary bash approval.' }), async () => {
      const refused = runtime.admission() ?? (restart && !matchesResumeParent(host, job.origin) ? 'The workflow parent changed.' : undefined);
      return refused ? { success: false, output: report(refused) } : { success: true, output: report(dagProjection(host, host.dags.start(job, runtime, restart))) };
    });
  }
  if (action === 'cancel' || action === 'pause') return approved(host, 'task', `Stop workflow ${job.id}`,
    `Halt exact workflow ${job.id} and stop only its exact live command owners. Cleanup must settle.`, async () => {
      const settled = await host.dags.stop(job, action === 'pause');
      return { success: settled, output: report(dagProjection(host, host.dags.journal.get(job.id))) };
    });
  return 'Inspect child command output using /jobs output <command-job-id> stdout|stderr <byte-offset>.';
}

function matchesResumeParent(host: JobsComposition, original: JobOrigin): boolean {
  const current = captureOrigin(host);
  if (original.goalId !== undefined && current.goalId !== original.goalId) return false;
  if (original.kind !== 'collaboration' && current.kind !== 'collaboration') return true;
  return original.kind === current.kind && original.principal === current.principal && original.acceptanceId === current.acceptanceId
    && original.roomId === current.roomId && original.serviceEpoch === current.serviceEpoch && original.hostGeneration === current.hostGeneration;
}
