import type { AdvisorReviewPacket, AdvisorState } from '../api.d.ts';

export function advisorReviewPacket({ checkpoints, captured }: Pick<AdvisorState, 'checkpoints' | 'captured'>): AdvisorReviewPacket {
  const allocation = Math.floor(32768 / Math.max(1, checkpoints.length));
  const coverage = { checkpoints: checkpoints.map(item => ({ id: item.id, digest: item.digest })),
    truncated: captured > checkpoints.length || checkpoints.some(item => item.truncated || item.text.length > allocation) };
  const context = checkpoints.map(item => `Checkpoint ${item.id}; digest ${item.digest}; step ${item.step}; ${item.willContinue ? 'continuing' : 'end'}${item.truncated || item.text.length > allocation ? '; snapshot text truncated' : ''}:\n${item.text.slice(-allocation)}`).join('\n\n');
  return { coverage, context };
}
