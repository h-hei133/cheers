import { sameValue } from '../../config/values.js';
import type { ToolPreparation, ToolExecutionResult } from '../../tools/types.js';
import type { AgentJob } from '../../workflow/jobs/agent/model.js';
import { prompt } from '../../workflow/jobs/agent/codec.js';
import { captureOrigin } from '../jobs/origin.js';
import { captureAgentRuntime } from '../jobs/agent/runtime.js';
import { agentProjection } from '../jobs/agent/projection.js';
import { report } from '../jobs/projection.js';
import type { DirectorOwner } from './model.js';

export function selectedWorker(owner: DirectorOwner, id: string): AgentJob {
  if (!owner.row.workers.includes(id)) throw new Error('The worker does not belong to this director.');
  return owner.host.agents.journal.get(id);
}
export function prepareWorker(owner: DirectorOwner, action: 'start' | 'send' | 'stop', args: Record<string, unknown>): ToolPreparation {
  const refused = owner.admission(); if (refused) throw new Error(refused);
  const { host } = owner;
  const job = action === 'start' ? undefined : selectedWorker(owner, String(args.id));
  const instruction = action === 'stop' ? `Stop exact worker ${job!.id}` : args.prompt;
  if (!prompt(instruction)) throw new Error('Worker assignment must be nonempty and at most 16 KiB.');
  const runtime = action === 'stop' ? undefined : host.agentRuntimeInput ? captureAgentRuntime(host, host.agentRuntimeInput,
    { worker: owner.row.worker, admission: owner.admission, directorId: owner.row.id, reserved: owner.reserved }) : undefined;
  if (action !== 'stop' && !runtime) throw new Error('The bound worker runtime is unavailable.');
  if (runtime?.admission()) throw new Error(runtime.admission());
  if (job && action === 'send' && (host.agents.hasLive(job.id) || !job.child || !sameValue(runtime!.checkpoint(job.child), job.checkpoint)
    || !['completed', 'failed', 'paused', 'cancelled'].includes(job.status))) throw new Error('Wait for a settled worker checkpoint before sending a fresh assignment.');
  runtime?.preflight();
  return { targets: [], permissionToolName: 'task', permissionArgs: { prompt: instruction }, previewKind: 'execution',
    preview: `${action === 'stop' ? 'Stop the exact live worker' : 'Explicit worker assignment'}${job ? ` ${job.id}` : ''}:\n${report(instruction, 24000)}\nWorker model: ${owner.row.worker.provider}/${owner.row.worker.model}; effort ${owner.row.worker.thinkingEffort ?? 'auto'}.\nThe persistent child shares the parent budget. This approval does not approve its file, process or network effects.`,
    execute: async context => {
      context.abortSignal?.throwIfAborted(); const changed = owner.admission(); if (changed) throw new Error(changed);
      if (job && !sameValue(job, host.agents.journal.get(job.id))) throw new Error('The approved worker checkpoint or state changed.');
      if (action === 'stop') {
        const settled = await host.agents.stop(job!);
        return { success: settled, output: report(agentProjection(host, host.agents.journal.get(job!.id))),
          metadata: { status: settled ? 'cancelled' : 'unknown', directorId: owner.row.id, workerId: job!.id } };
      }
      const next = job ? host.agents.start(job, runtime!, instruction) : host.agents.create(instruction, captureOrigin(host), runtime!);
      return started(owner, next);
    } };
}
function started(owner: DirectorOwner, job: AgentJob): ToolExecutionResult {
  return { success: true, output: report(agentProjection(owner.host, job)), metadata: { status: 'started', directorId: owner.row.id,
    workerId: job.id, childSessionId: job.childSessionId, runId: job.runs.at(-1)!.id } };
}
