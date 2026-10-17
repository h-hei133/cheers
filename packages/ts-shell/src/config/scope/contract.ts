export type ScopeBasis = 'session' | 'target';

/** Only registered public operation inputs can appear in a path rule. */
export interface ScopeSettings {
  readonly maxTurns?: number;
  readonly temperature?: number;
  readonly topP?: number;
  readonly maxOutputTokens?: number;
  readonly contextWindow?: number;
  readonly reserveTokens?: number;
  readonly instructionBudgetBytes?: number;
  readonly retryEnabled?: boolean;
  readonly retryMaxRetries?: number;
  readonly providerRetryMaxRetries?: number;
  readonly retryBaseDelayMs?: number;
  readonly retryMaxDelayMs?: number;
  readonly steeringMode?: 'one-at-a-time' | 'all';
  readonly followUpMode?: 'one-at-a-time' | 'all';
  readonly providerConnectTimeoutMs?: number;
  readonly providerHeadersTimeoutMs?: number;
  readonly providerBodyTimeoutMs?: number;
  readonly allowedModels?: readonly string[];
  readonly allowedTools?: readonly string[];
  readonly disabledTools?: readonly string[];
  readonly hiddenToolPrefixes?: readonly string[];
  readonly denyRules?: readonly { readonly tool: string; readonly pattern?: string }[];
  readonly enableMcpTools?: boolean;
}

export type ScopeField = keyof ScopeSettings;
export interface ScopeFieldPolicy {
  readonly basis: readonly ScopeBasis[];
  readonly consumers: readonly string[];
}
export interface PathRule {
  readonly path: string;
  readonly settings: ScopeSettings;
}
