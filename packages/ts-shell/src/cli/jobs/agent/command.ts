import { sameValue } from '../../../config/values.js';
import type { JobsComposition } from '../model.js';
import { report } from '../projection.js';
import { approved } from '../approval.js';
import { captureOrigin } from '../origin.js';
import { captureAgentRuntime, AgentCaptureError } from './runtime.js';
import { agentProjection, agentPage } from './projection.js';

export async function agentControl(host: JobsComposition, action: string, args: readonly string[], queue = false): Promise<string> {
  if (action === 'agent') {
    if (!host.agentRuntimeInput) throw new Error('The bound agent runner is unavailable.');
    const runtime = await runtimeFor(host); if (typeof runtime === 'string') return runtime;
    const refused = runtime.admission(); if (refused) return report(refused);
    return approved(host, 'task', args[0]!, `Independent agent assignment:\n${report(args[0]!, 24000)}\nParent context and skills are copied; model requests share the parent budget. Session-bound extension tools are unavailable; MCP inherits already discovered tools. Declared command hooks prevent side-agent startup. Tool effects still use their ordinary approval. ${queue ? 'Queue only; resume requires fresh approval.' : 'Runs alongside the main session.'}`,
      async () => {
        const refused = runtime.admission();
        return refused ? { success: false, output: report(refused) }
          : { success: true, output: report(agentProjection(host, host.agents.create(args[0]!, captureOrigin(host), runtime, queue))) };
      });
  }
  const job = host.agents.journal.get(args[0]!);
  if (action === 'show') return report(agentProjection(host, job));
  if (action === 'output') {
    if (args[1] !== 'text') throw new Error('Agent jobs use the text output stream.'); return agentPage(job, Number(args[2]));
  }
  if (action === 'cancel' || action === 'pause') return approved(host, 'task', job.prompt,
    `${action} exact agent ${job.id}. Cleanup must settle; no stored owner handle is recreated.`, async () => {
      const stopped = await host.agents.stop(job, action === 'pause');
      return { success: stopped, output: stopped ? `Agent ${job.id} ${action === 'pause' ? 'paused' : 'cancelled'}; live cleanup settled.`
        : `Agent ${job.id} has no confirmed cancellable owner or cleanup remains unknown.` };
    });
  if (action === 'resume' || action === 'continue') {
    if (!host.agentRuntimeInput) throw new Error('The bound agent runner is unavailable.');
    if (action === 'resume' && job.runs.length > 0) throw new Error('Dispatched agent runs never resume; use a new checkpoint continuation.');
    const runtime = await runtimeFor(host); if (typeof runtime === 'string') return runtime;
    const refused = runtime.admission(); if (refused) return report(refused);
    const checkpoint = job.child ? runtime.checkpoint(job.child) : undefined;
    if (checkpoint && !sameValue(checkpoint, job.checkpoint)) throw new Error('The retained child checkpoint changed.');
    const instruction = action === 'continue' ? args[1]! : job.prompt;
    return approved(host, 'task', instruction, `${action === 'continue' ? 'New checkpoint continuation' : 'Fresh undispatched agent approval'} for ${job.id}:\n${report(instruction, 24000)}\nPrior run IDs and possible effects are retained; no previous run is replayed.`,
      async () => {
        const refused = runtime.admission();
        return refused ? { success: false, output: report(refused) }
          : { success: true, output: report(agentProjection(host, host.agents.start(job, runtime, action === 'continue' ? instruction : undefined))) };
      });
  }
  throw new Error('Unsupported agent job action.');
}

async function runtimeFor(host: JobsComposition) {
  try { return await captureAgentRuntime(host, host.agentRuntimeInput!); }
  catch (error) { if (error instanceof AgentCaptureError) return report(error.message); throw error; }
}
