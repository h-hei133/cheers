export interface ToolExecutionRecord {
  readonly toolName: string;
  readonly argumentsSummary: string;
  readonly resultSummary: string;
  readonly timestamp: string;
  readonly success: boolean;
}

export interface WorkingMemoryState {
  readonly taskPrompt: string;
  readonly scratchpadNotes: readonly string[];
  readonly candidateDirectives: readonly string[];
  readonly toolExecutions: readonly ToolExecutionRecord[];
  readonly updatedAt: string;
}

export function createWorkingMemory(taskPrompt: string): WorkingMemoryState {
  return {
    taskPrompt,
    scratchpadNotes: [],
    candidateDirectives: [],
    toolExecutions: [],
    updatedAt: new Date().toISOString(),
  };
}

export function appendScratchpadNote(
  memory: WorkingMemoryState,
  note: string,
): WorkingMemoryState {
  const trimmed = note.trim();
  if (!trimmed) {
    return memory;
  }
  return {
    ...memory,
    scratchpadNotes: [...memory.scratchpadNotes, trimmed],
    updatedAt: new Date().toISOString(),
  };
}

export function recordToolExecution(
  memory: WorkingMemoryState,
  record: ToolExecutionRecord,
): WorkingMemoryState {
  return {
    ...memory,
    toolExecutions: [...memory.toolExecutions, record],
    updatedAt: new Date().toISOString(),
  };
}
