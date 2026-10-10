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
        permission: 'Approve scheduling only; every command still needs its ordinary bash approval.', restart: 'A dispatched graph never resumes or replays.' }),
      async () => {
        const refused = runtime.admission();
        return refused ? { success: false, output: report(refused) } : { success: true,
          output: report(dagProjection(host, host.dags.create(loaded.workflow, origin, runtime, action === 'queue'))) };
      });
      return { kind: 'local', output };
    }
    return { kind: 'local', output: await dagControl(host, action, parsed.args) };
  } catch { return { kind: 'local', output: 'Workflow operation refused or unverified. Inspect /workflow status; dispatched graphs never replay.' }; }
}
export async function dagControl(host: JobsComposition, action: string, args: readonly string[]): Promise<string> {
  const job = host.dags.journal.get(args[0]!);
  if (action === 'show') return report(dagProjection(host, job));
  if (action === 'resume') {
    if (job.dispatchPossible) return 'Dispatched graphs never resume or replay; start a new explicitly approved workflow.';
    const runtime = captureDagRuntime(host, job.definition, job.directory); const refused = runtime.admission(); if (refused) return report(refused);
    return approved(host, 'task', `Resume workflow ${job.definition.name}`, report({ id: job.id, definition: job.definition,
      permission: 'Fresh scheduling approval; command effects still require ordinary bash approval.' }), async () => {
      const refused = runtime.admission();
      return refused ? { success: false, output: report(refused) } : { success: true, output: report(dagProjection(host, host.dags.start(job, runtime))) };
    });
  }
  if (action === 'cancel' || action === 'pause') return approved(host, 'task', `Stop workflow ${job.id}`,
    `Halt exact workflow ${job.id} and stop only its exact live command owners. A dispatched graph cannot resume. Cleanup must settle.`, async () => {
      const settled = await host.dags.stop(job, action === 'pause');
      return { success: settled, output: report(dagProjection(host, host.dags.journal.get(job.id))) };
    });
  return 'Inspect child command output using /jobs output <command-job-id> stdout|stderr <byte-offset>.';
}
