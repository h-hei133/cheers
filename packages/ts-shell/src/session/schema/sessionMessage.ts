export interface SessionToolCall {
  readonly id: string;
  readonly type: "function";
  readonly function: {
    readonly name: string;
    readonly arguments: string;
  };
}

export interface SessionMessage {
  id?: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: readonly SessionToolCall[];
  tool_call_id?: string;
  timestamp?: string;
  /**
   * The model an assistant answer came from, when the answer was model-shaped.
   *
   * Optional because every other role has no model behind it, and because the
   * transcripts written before this field existed hold answers that cannot be
   * attributed. A reader that finds it absent treats the answer as coming from
   * the current model rather than from a different one, so old records keep
   * behaving the way they did when they were written.
   */
  origin?: {
    readonly provider?: string;
    readonly model: string;
  };
}
