interface ProtocolOwner {
  readonly id: string;
  readonly runtime: string;
  readonly models: readonly {
    readonly id: string;
    readonly reasoning?: boolean;
    readonly compat?: { readonly endpoint?: string };
  }[];
}

/** Native defaults require an exact host and a positively declared model. */
export function nativeOpenAIReasoning(entry: ProtocolOwner | undefined, address: string | undefined, model: string | undefined): boolean {
  return entry?.id === 'openai' && entry.runtime === 'openai'
    && address?.trim().replace(/\/+$/, '') === 'https://api.openai.com/v1'
    && model !== undefined && entry.models.some(candidate => candidate.id === model && candidate.reasoning === true
      && candidate.compat?.endpoint === 'openai-responses');
}

/** Canonical metadata cannot opt an unrelated relay into native summaries. */
export function summaryProtocol(entry: ProtocolOwner | undefined, address: string | undefined, endpoint: string | undefined): boolean {
  if (!entry) return false;
  if (endpoint !== 'openai-responses' && endpoint !== 'openai-account-responses') return false;
  if (entry?.id !== 'openai' || entry.runtime !== 'openai') return true;
  const normalized = address?.trim().replace(/\/+$/, '');
  return endpoint === 'openai-responses' ? normalized === 'https://api.openai.com/v1'
    : normalized === 'https://chatgpt.com/backend-api';
}
