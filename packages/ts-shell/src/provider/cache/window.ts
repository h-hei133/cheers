import type { CatalogModel } from '../../core/models/catalog.js';
import type { CacheRetention, CacheWindow } from './model.js';

/** Capture the tier the endpoint actually serialized; affinity alone promises no duration. */
export function requestCacheWindow(input: {
  readonly endpoint: string;
  readonly retention?: CacheRetention;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly model?: CatalogModel;
}): CacheWindow {
  const { payload, model, endpoint } = input;
  if (input.retention === 'none') return Object.freeze({ retention: 'none' });
  let retention: CacheRetention = 'short';
  let protocolSeconds: number | undefined;
  if (endpoint === 'anthropic-messages' || endpoint === 'copilot-messages') {
    const groups = [payload.system, payload.tools, ...(Array.isArray(payload.messages)
      ? payload.messages.map(message => message && typeof message === 'object' ? message.content : undefined) : [])];
    let marked = false;
    for (const group of groups) {
      if (!Array.isArray(group)) continue;
      for (const block of group) {
        if (!block || typeof block !== 'object' || block.cache_control?.type !== 'ephemeral') continue;
        marked = true;
        const seconds = block.cache_control.ttl === '1h' ? 3600 : 300;
        protocolSeconds = Math.min(protocolSeconds ?? seconds, seconds);
        retention = protocolSeconds === 3600 ? 'long' : 'short';
      }
    }
    if (!marked) return Object.freeze({ retention: 'none' });
  } else if (endpoint !== 'openai-account-responses') {
    if (payload.prompt_cache_retention === '24h') { retention = 'long'; protocolSeconds = 86_400; }
    else if (payload.prompt_cache_options && typeof payload.prompt_cache_options === 'object'
      && !Array.isArray(payload.prompt_cache_options) && 'ttl' in payload.prompt_cache_options
      && payload.prompt_cache_options.ttl === '30m') { retention = 'long'; protocolSeconds = 1800; }
  }
  const declared = model?.promptCache?.[retention];
  const seconds = typeof declared === 'number' && Number.isFinite(declared) && declared > 0 && Number.isSafeInteger(declared * 1000)
    ? protocolSeconds === undefined ? declared : Math.min(declared, protocolSeconds) : undefined;
  const ttlMs = seconds === undefined ? undefined : seconds * 1000;
  return Object.freeze({ retention, ...(ttlMs !== undefined && Number.isSafeInteger(ttlMs) ? { ttlMs } : {}) });
}
