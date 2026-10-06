import type { RuntimeConfig, RuntimeConfigFile } from './runtimeConfig.js';
import { sameValue } from './values.js';

type Application = 'next operation' | 'immediate' | 'restart' | 'metadata';
/** Field-complete application policy. Values containing credentials are never rendered. */
const application = {
  schemaVersion: 'metadata', provider: 'next operation', providerCredentials: 'next operation',
  providerConnections: 'next operation', activeProviderConnectionId: 'next operation',
  maxTurns: 'next operation', allowedTools: 'next operation', disabledTools: 'next operation',
  hiddenToolPrefixes: 'next operation', denyRules: 'next operation', enableMcpTools: 'next operation',
  temperature: 'next operation', topP: 'next operation', maxOutputTokens: 'next operation',
  contextWindow: 'next operation', reserveTokens: 'next operation', modelTokenBudgets: 'next operation',
  instructionBudgetBytes: 'next operation', offline: 'next operation', cacheWarming: 'next operation',
  agentMode: 'next operation', theme: 'immediate', tuiMode: 'restart', tui: 'restart',
  retryEnabled: 'next operation', retryMaxRetries: 'next operation', providerRetryMaxRetries: 'next operation',
  retryBaseDelayMs: 'next operation', retryMaxDelayMs: 'next operation', steeringMode: 'next operation',
  followUpMode: 'next operation', providerConnectTimeoutMs: 'next operation',
  providerHeadersTimeoutMs: 'next operation', providerBodyTimeoutMs: 'next operation',
} satisfies Record<keyof RuntimeConfigFile, Application>;

export function describeConfigChanges(before: RuntimeConfig, after: RuntimeConfig): string[] {
  return Object.entries(application).flatMap(([key, timing]) => {
    if (timing === 'metadata') return [];
    const field = key as keyof RuntimeConfig;
    return sameValue(before[field], after[field]) ? [] : [`${key}: changed (${timing})`];
  });
}

export function configRestartRequired(installed: RuntimeConfig, accepted: RuntimeConfig): string[] {
  return (['tuiMode', 'tui'] as const).filter(field => !sameValue(installed[field], accepted[field]));
}
