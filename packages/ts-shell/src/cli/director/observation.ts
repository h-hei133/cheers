import type { ToolDefinition } from '../../tools/types.js';
import { readOnlyTool } from '../../core/tools/capability.js';
import { agentPage, agentProjection } from '../jobs/agent/projection.js';
import { report } from '../jobs/projection.js';
import { selectedWorker } from './workers.js';
import type { DirectorOwner } from './model.js';

const id = { type: 'string', description: 'Exact worker ID.' };
export function workerObservations(owner: DirectorOwner): ToolDefinition[] {
  return [readOnlyTool({ name: 'worker_show', description: 'Inspect actual native worker state, child identity and run checkpoints; output is not acceptance proof.',
    argsSchema: { type: 'object', properties: { id }, required: ['id'], additionalProperties: false }, resultAdmission: owner.admission,
    execute: async args => ({ success: true, output: report(agentProjection(owner.host, selectedWorker(owner, String(args.id)))) }) }),
  readOnlyTool({ name: 'worker_output', description: 'Read a report-safe worker output page using raw UTF-8 byte offsets.',
    argsSchema: { type: 'object', properties: { id, offset: { type: 'integer', minimum: 0 } }, required: ['id', 'offset'], additionalProperties: false },
    resultAdmission: owner.admission, execute: async args => ({ success: true, output: agentPage(selectedWorker(owner, String(args.id)), Number(args.offset)) }) }),
  readOnlyTool({ name: 'worker_wait', description: 'Wait up to 30 seconds for the exact current worker run; a timeout reports its current state without claiming completion.',
    argsSchema: { type: 'object', properties: { id, seconds: { type: 'integer', minimum: 1, maximum: 30 } }, required: ['id'], additionalProperties: false },
    resultAdmission: owner.admission, execute: async (args, context) => ({ success: true,
      output: await waitWorker(owner, String(args.id), Number(args.seconds ?? 30), context.abortSignal) }) }),
  ];
}
export async function waitWorker(owner: DirectorOwner, id: string, seconds: number, signal?: AbortSignal): Promise<string> {
  if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > 30) throw new Error('Worker wait must be 1–30 seconds.');
  const job = selectedWorker(owner, id); const runId = job.runs.at(-1)?.id;
  const deadline = Date.now() + seconds * 1000;
  while (owner.host.agents.hasLive(id) && Date.now() < deadline) {
    signal?.throwIfAborted(); const refused = owner.admission(); if (refused) throw new Error(refused);
    if (selectedWorker(owner, id).runs.at(-1)?.id !== runId) throw new Error('The selected worker run changed while waiting.');
    await new Promise<void>(resolve => setTimeout(resolve, 25));
  }
  const current = selectedWorker(owner, id);
  if (current.runs.at(-1)?.id !== runId) throw new Error('The selected worker run changed while waiting.');
  return report({ ...agentProjection(owner.host, current), waiting: owner.host.agents.hasLive(id) });
}
