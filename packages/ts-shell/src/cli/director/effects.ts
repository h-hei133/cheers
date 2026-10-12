import type { ToolDefinition } from '../../tools/types.js';
import type { DirectorOwner } from './model.js';
import { prepareWorker } from './workers.js';

const id = { type: 'string', description: 'Exact worker job ID returned by worker_start.' };
const prompt = { type: 'string', description: 'Complete explicit assignment, including its constraints.' };
export function workerEffects(owner: DirectorOwner): ToolDefinition[] {
  return (['start', 'send', 'stop'] as const).map(action => ({ name: `worker_${action}`,
    description: action === 'start' ? 'Approve a persistent independent worker on the selected model. Its tool effects require their own approval.'
      : action === 'send' ? 'Approve a fresh assignment from a settled worker checkpoint, retaining the same child and model. Busy or unknown workers refuse.'
        : 'Approve stopping the exact live worker; unconfirmed cleanup remains unknown.',
    argsSchema: { type: 'object', properties: { ...(action === 'start' ? {} : { id }), ...(action === 'stop' ? {} : { prompt }) },
      required: [...(action === 'start' ? [] : ['id']), ...(action === 'stop' ? [] : ['prompt'])], additionalProperties: false },
    resultAdmission: owner.admission,
    prepare: (args, context) => prepareWorker(owner, action, args, context.abortSignal),
    execute: async () => ({ success: false, error: 'Prepared worker approval is required.' }),
  }));
}
