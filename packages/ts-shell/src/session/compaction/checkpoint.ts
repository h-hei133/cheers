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
