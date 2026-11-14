import type { MessageContent, ProviderMessage } from '../../model-adapters/message.js';
import type { PromptMeasurement } from './request/measurement.js';
import type { CustomAgentMessage } from './custom.js';
import { captureMessageHistory } from './custom.js';
import type { RequestDeclaration } from './declarations/model.js';
export type { CustomAgentMessage, CustomMessageInput } from './custom.js';

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
  /** Runtime declarations retain their original system-message history position. */
  readonly requestDeclaration?: RequestDeclaration;
}

export type AgentMessage = StandardAgentMessage | CustomAgentMessage;

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
    messages: initial?.messages ? captureMessageHistory(initial.messages) : [],
    isStreaming: false,
    streamingMessage: undefined,
    pendingToolCalls: new Set<string>(),
    errorMessage: undefined,
  };
}
