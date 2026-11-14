import type { AgentMessage } from '../../core/agent/state.js';

/** Opens the message a compaction leaves in place of the history it condensed. */
export const CONTEXT_CHECKPOINT_MARKER = "[Context Checkpoint]";

/** The message that stands in for a span of condensed history. */
export function formatContextCheckpoint(summary: string): string {
  return `${CONTEXT_CHECKPOINT_MARKER}\n${summary}`;
}

/**
 * Recognize an earlier checkpoint so the next compaction revises its summary
 * rather than repeatedly condensing it as ordinary history.
 */
export function readContextCheckpoint(content: string): string | undefined {
  if (!content.startsWith(CONTEXT_CHECKPOINT_MARKER)) {
    return undefined;
  }
  return content.slice(CONTEXT_CHECKPOINT_MARKER.length).replace(/^\n/, "");
}
/** Declaration state is carried before a checkpoint, independently of dialogue. */
export function contextCheckpointIndex(messages: readonly AgentMessage[]): number {
  let index = messages[0]?.role === 'system' && !messages[0].requestDeclaration ? 1 : 0;
  while (messages[index]?.requestDeclaration) index++;
  return index;
}
