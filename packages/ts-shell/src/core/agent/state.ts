import type { SessionMessage } from "../../session/schema/sessionMessage.js";

export type AgentStopReason = "stop" | "length" | "error" | "aborted";

export interface AgentMessage extends SessionMessage {
  readonly admissionFailure?: import('./request/model.js').ModelAdmissionError['code'];
  readonly stopReason?: AgentStopReason | string;
  readonly errorMessage?: string;
}

export interface AgentState {
  systemPrompt: string;
  messages: AgentMessage[];
  isStreaming: boolean;
  streamingMessage?: AgentMessage;
  pendingToolCalls: ReadonlySet<string>;
  errorMessage?: string;
}

export interface InitialAgentState {
  readonly systemPrompt?: string;
  readonly messages?: readonly AgentMessage[];
}

export function createAgentState(initial?: InitialAgentState): AgentState {
  return {
    systemPrompt: initial?.systemPrompt ?? "",
    messages: initial?.messages ? [...initial.messages] : [],
    isStreaming: false,
    streamingMessage: undefined,
    pendingToolCalls: new Set<string>(),
    errorMessage: undefined,
  };
}
