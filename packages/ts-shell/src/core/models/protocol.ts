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
  const normalized = address?.trim().replace(/\/+$/, '');
  if (entry.id === 'openai') {
    return entry.runtime === 'openai' && (endpoint === 'openai-responses' ? normalized === 'https://api.openai.com/v1'
      : endpoint === 'openai-account-responses' && normalized === 'https://chatgpt.com/backend-api');
  }
  if (entry.id === 'google-ai') {
    return entry.runtime === 'google-ai' && endpoint === 'google-generative-ai'
      && normalized === 'https://generativelanguage.googleapis.com';
  }
  if (entry.id === 'vertex') {
    return entry.runtime === 'vertex' && endpoint === 'google-vertex' && vertexAddress(normalized);
  }
  return endpoint === 'openai-responses' || endpoint === 'openai-account-responses'
    || endpoint === 'google-generative-ai' || endpoint === 'google-vertex';
}

/** The captured Vertex resource must name its own official global or regional host. */
function vertexAddress(address: string | undefined): boolean {
  if (!address || /[?#\\]/.test(address)) return false;
  const resource = /^https:\/\/[^/@]+(\/v1\/projects\/[A-Za-z0-9_-]+\/locations\/([a-z0-9]+(?:-[a-z0-9]+)*)\/publishers\/google\/models)$/.exec(address);
  if (!resource) return false;
  try {
    const url = new URL(address);
    const location = resource[2];
    const hostname = location === 'global' ? 'aiplatform.googleapis.com' : `${location}-aiplatform.googleapis.com`;
    return url.protocol === 'https:' && url.hostname === hostname && !url.port && !url.username && !url.password
      && url.pathname === resource[1];
  } catch { return false; }
}
