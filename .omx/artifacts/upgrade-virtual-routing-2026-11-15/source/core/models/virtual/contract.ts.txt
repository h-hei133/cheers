import type { AgentMessage } from '../../agent/state.js';
import type { ThinkingLevel } from '../effort.js';

export type ModelRouteReason = 'user' | 'continuation' | 'retry' | 'direct';

/** Cancellation observation shared by host and file-extension callbacks; no native branding is promised. */
export interface ModelRouteSignal {
  readonly aborted: boolean;
  readonly reason: unknown;
  throwIfAborted(): void;
  addEventListener(type: 'abort', callback: EventListenerOrEventListenerObject | null,
    options?: boolean | { readonly once?: boolean; readonly capture?: boolean; readonly passive?: boolean }): void;
  removeEventListener(type: 'abort', callback: EventListenerOrEventListenerObject | null,
    options?: boolean | { readonly capture?: boolean }): void;
  onabort: ((event: Event) => unknown) | null;
}

/** Physical response identity, without executable handles or credentials. */
export interface ModelRouteTarget {
  readonly provider: string;
  readonly modelId: string;
  readonly thinkingLevel?: ThinkingLevel;
}

/** A dispatched attempt that failed; local routing failures have no physical target. */
export interface ModelRouteFailure extends ModelRouteTarget {
  readonly stopReason: 'error' | 'aborted';
  readonly errorMessage?: string;
  readonly failureClass?: string;
}

export interface ModelRouteRequest<TState = unknown> {
  readonly provider: string;
  readonly modelId: string;
  readonly thinkingLevel: ThinkingLevel;
  readonly reason: ModelRouteReason;
  readonly state?: TState;
  readonly previous?: ModelRouteTarget;
  readonly failed?: ModelRouteFailure;
  readonly messages: readonly AgentMessage[];
  readonly signal?: ModelRouteSignal;
}

/** Host entry points require a native signal; file callbacks receive a realm-local observation. */
export type ModelRouteInput<TState = unknown> = Omit<ModelRouteRequest<TState>, 'signal'> & {
  readonly signal?: AbortSignal;
};

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

/** Captured registrations expose a host invocation boundary, separate from the authored callback. */
export interface CapturedVirtualModelDefinition<TState = unknown> extends VirtualModelMetadata {
  readonly route: (request: ModelRouteInput<TState>) => ModelRoute<TState> | Promise<ModelRoute<TState>>;
}
