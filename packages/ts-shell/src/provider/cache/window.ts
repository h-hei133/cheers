import type { CatalogModel } from '../../core/models/catalog.js';
import { isRecord } from '../../core/values/record.js';
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
  const bedrock = endpoint === 'bedrock-converse-stream';
  if (bedrock || endpoint === 'anthropic-messages' || endpoint === 'copilot-messages') {
    const tools = bedrock && isRecord(payload.toolConfig) ? payload.toolConfig.tools : payload.tools;
    const groups = [payload.system, tools, ...(Array.isArray(payload.messages)
      ? payload.messages.map(message => message && typeof message === 'object' ? message.content : undefined) : [])];
    for (const group of groups) {
      if (!Array.isArray(group)) continue;
      for (const block of group) {
        if (!isRecord(block)) continue;
        const marker = bedrock ? block.cachePoint : block.cache_control;
        if (!isRecord(marker) || marker.type !== (bedrock ? 'default' : 'ephemeral')) continue;
        const seconds = marker.ttl === '1h' ? 3600 : 300;
        protocolSeconds = Math.min(protocolSeconds ?? seconds, seconds);
      }
    }
    if (protocolSeconds === undefined) return Object.freeze({ retention: 'none' });
    retention = protocolSeconds === 3600 ? 'long' : 'short';
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
