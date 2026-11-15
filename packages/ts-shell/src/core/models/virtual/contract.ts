import type { AgentMessage } from '../../agent/state.js';
import type { ThinkingLevel } from '../effort.js';

export type ModelRouteReason = 'user' | 'continuation' | 'retry' | 'direct';

export interface ModelRouteRequest<TState = unknown> {
  readonly provider: string;
  readonly modelId: string;
  readonly thinkingLevel: ThinkingLevel;
  readonly reason: ModelRouteReason;
  readonly state?: TState;
  readonly messages: readonly AgentMessage[];
  readonly signal?: AbortSignal;
}

export interface ModelRoute<TState = unknown> {
  readonly provider: string;
  readonly modelId: string;
  readonly thinkingLevel?: ThinkingLevel;
  readonly state?: TState;
}

/** Inert selection metadata; physical capabilities and credentials belong to the routed model. */
export interface VirtualModelMetadata {
  readonly provider: string;
  readonly id: string;
  readonly name: string;
  readonly thinkingLevels?: readonly ThinkingLevel[];
  readonly contextWindow?: number;
  readonly maxTokens?: number;
}

export interface VirtualModelDefinition<TState = unknown> extends VirtualModelMetadata {
  readonly route: (request: ModelRouteRequest<TState>) => ModelRoute<TState> | Promise<ModelRoute<TState>>;
}
