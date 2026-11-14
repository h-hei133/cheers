import type { MessageContent, ProviderMessage } from '../../model-adapters/message.js';
import type { PromptMeasurement } from './request/measurement.js';

export type AgentStopReason = "stop" | "length" | "error" | "aborted";

type MutableProviderMessage = { -readonly [Field in keyof ProviderMessage]: ProviderMessage[Field] };

/** Agent history owns its identity and observations independently of session storage. */
export interface StandardAgentMessage extends MutableProviderMessage {
  id?: string;
  content: MessageContent;
  /** Structured facts accompany prose so durable readers can restore tool state. */
  metadata?: Record<string, unknown>;
  timestamp?: string;
  /** Provider failures retain a machine-readable class separately from their prose. */
  failureClass?: string;
  /** Measurement belongs to the request that produced this assistant message. */
  readonly promptMeasurement?: PromptMeasurement;
  readonly admissionFailure?: import('./request/model.js').ModelAdmissionError['code'];
  readonly stopReason?: AgentStopReason | string;
  readonly errorMessage?: string;
}

export type AgentMessage = StandardAgentMessage;

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
