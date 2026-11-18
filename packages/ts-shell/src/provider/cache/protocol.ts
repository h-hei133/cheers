import type { CacheRetention } from './model.js';
import { nativeCacheAddress } from '../../core/models/protocol.js';

interface CacheControls {
  readonly sessionId?: string;
  readonly baseUrl?: string;
  readonly cacheRetention?: CacheRetention;
  readonly supportsPromptCacheKey?: boolean;
  readonly supportsLongCacheRetention?: boolean;
  readonly supportsExplicitPromptCacheMode?: boolean;
}

/** Session affinity and extended retention have separate admission and wire vocabulary. */
export function promptCacheFields(input: CacheControls, responses = false): Record<string, unknown> {
  const retention = input.cacheRetention ?? 'short';
  const official = nativeCacheAddress(input.baseUrl, 'openai');
  const keySupported = input.supportsPromptCacheKey === undefined ? official : input.supportsPromptCacheKey === true;
  const longSupported = input.supportsLongCacheRetention === undefined ? official : input.supportsLongCacheRetention === true;
  const explicit = responses && input.supportsExplicitPromptCacheMode === true;
  const key = retention !== 'none' && keySupported && input.sessionId
    ? Array.from(input.sessionId).slice(0, 64).join('') : undefined;
  return {
    ...(key ? { prompt_cache_key: key } : {}),
    ...(retention === 'long' && longSupported && !explicit ? { prompt_cache_retention: '24h' } : {}),
    ...(explicit && retention === 'none' ? { prompt_cache_options: { mode: 'explicit' } }
      : explicit && retention === 'long' && longSupported ? { prompt_cache_options: { ttl: '30m' } } : {}),
  };
}
