import type { EscalationPrompt, EscalationResponse } from '../core/shell/approval/contract.js';

/** Emulate the approval picker choosing every offered group and its refined preview. */
export function approveAllGroups(prompt: EscalationPrompt): EscalationResponse {
  const selected = prompt.context.selections?.map(selection => selection.id);
  if (!selected?.length) {
    return { promptId: prompt.id, decision: 'allow-once', respondedAt: Date.now() };
  }
  const refined = prompt.context.selectionPreview?.(selected);
  return {
    promptId: prompt.id,
    decision: 'allow-once',
    respondedAt: Date.now(),
    selected,
    ...(refined ? { selectionRevision: refined.revision } : prompt.context.selectionRevision
      ? { selectionRevision: prompt.context.selectionRevision } : {}),
  };
}
