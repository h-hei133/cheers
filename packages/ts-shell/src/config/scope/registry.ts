import type { ScopeField, ScopeFieldPolicy } from './contract.js';

const request = { basis: ['session'], consumers: ['provider step', 'delegated step'] } as const;
const transport = { basis: ['session'], consumers: ['provider transport', 'compaction transport'] } as const;
const restriction = { basis: ['session', 'target'], consumers: ['tool visibility', 'tool preparation', 'tool effect admission'] } as const;

/** Schema, source, trust and merge policy remain in the owning field registry. */
export const SCOPE_FIELDS = {
  maxTurns: { basis: ['session'], consumers: ['turn step limit'] },
  temperature: request,
  topP: request,
  maxOutputTokens: request,
  contextWindow: { basis: ['session'], consumers: ['compaction window'] },
  reserveTokens: { basis: ['session'], consumers: ['compaction reserve'] },
  instructionBudgetBytes: { basis: ['session'], consumers: ['project instruction acquisition'] },
  retryEnabled: { basis: ['session'], consumers: ['turn retry'] },
  retryMaxRetries: { basis: ['session'], consumers: ['turn retry'] },
  providerRetryMaxRetries: request,
  retryBaseDelayMs: request,
  retryMaxDelayMs: request,
  steeringMode: { basis: ['session'], consumers: ['turn input queue'] },
  followUpMode: { basis: ['session'], consumers: ['turn input queue'] },
  providerConnectTimeoutMs: transport,
  providerHeadersTimeoutMs: transport,
  providerBodyTimeoutMs: transport,
  allowedModels: { basis: ['session'], consumers: ['model request admission', 'delegated model admission'] },
  allowedTools: restriction,
  disabledTools: restriction,
  hiddenToolPrefixes: restriction,
  denyRules: restriction,
  enableMcpTools: restriction,
} as const satisfies Record<ScopeField, ScopeFieldPolicy>;
