import { advisorText } from './checkpoint.js';
import type { AdvisorState } from './model.js';

export function showAdvisor(state: AdvisorState, dump = false): string {
  return [`Advisor ${state.status}; ${state.enabled ? 'enabled setting' : 'off'}.`,
    state.config ? `Target: ${state.config.target}; mode: ${state.config.mode}; every: ${state.config.every}; timeout: ${state.config.timeoutMs}ms.` : 'No model configured.',
    `Checkpoints: ${state.checkpoints.length} retained of ${state.captured}; eligible boundaries: ${state.eligible}; notes: ${state.notes.length}.`,
    ...(state.pending ? ['Execution pending or drain unconfirmed; another review cannot start.'] : []),
    'Reviews are bounded and awaited. Advice has no write or approval authority; apply explicitly through the ordinary prompt path.',
    ...(dump ? state.checkpoints.map(item => `Checkpoint ${item.id}; source ${item.sourcePromptEntryId}; step ${item.step}; digest ${item.digest}; ${item.willContinue ? 'continuing' : 'end'}\n${item.text}`) : []),
    ...state.notes.map(note => `Note ${note.id}; target ${note.target}; recorded ${note.timestamp}; epoch ${note.epoch}; checkpoint ${note.checkpointId}; covers ${note.coverage.checkpoints.length} captured boundaries${note.coverage.truncated ? ' with explicit truncation' : ''}; ${note.submittedAt ? 'submitted to the ordinary prompt path' : 'unapplied'}${dump ? `; digest ${note.checkpointDigest}\n${note.text}` : ''}`),
  ].map(line => advisorText(line, 40000)).join('\n');
}
