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
}
