import type { TurnRequest } from '../kinds.js';
import type { WireMessage } from './messages.js';

export interface CachePoint {
  readonly cachePoint: { readonly type: 'default'; readonly ttl?: '1h' };
}

const CLAUDE_CACHE_MODELS = new Set([
  'anthropic.claude-sonnet-4-5-20250929-v1:0',
  'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
  'eu.anthropic.claude-sonnet-4-5-20250929-v1:0',
  'au.anthropic.claude-sonnet-4-5-20250929-v1:0',
  'jp.anthropic.claude-sonnet-4-5-20250929-v1:0',
  'global.anthropic.claude-sonnet-4-5-20250929-v1:0',
  'anthropic.claude-opus-4-5-20251101-v1:0',
  'us.anthropic.claude-opus-4-5-20251101-v1:0',
  'eu.anthropic.claude-opus-4-5-20251101-v1:0',
  'global.anthropic.claude-opus-4-5-20251101-v1:0',
]);

// Nova's tokenizer is service-owned. Bound text-only prefixes below its
// 20,000-token ceiling with headroom for framing and tokenization differences.
const NOVA_CACHE_PREFIX_BYTES = 16_000;
const NOVA_BLOCK_OVERHEAD = 64;

/** Converse cache points are scoped to the service's regional HTTPS root. */
export function converseCache(input: Pick<TurnRequest, 'baseUrl' | 'cacheRetention' | 'model'>): {
  readonly point: CachePoint;
  readonly tools: boolean;
  readonly textPrefixLimit?: number;
} | undefined {
  if (input.cacheRetention === 'none' || !input.baseUrl) return undefined;
  let url: URL;
  try { url = new URL(input.baseUrl); } catch { return undefined; }
  if (url.protocol !== 'https:' || url.port || url.username || url.password || url.search || url.hash
    || !/^\/*$/.test(url.pathname)
    || !/^bedrock-runtime\.[a-z]{2}-(?:[a-z]+-)+\d+\.amazonaws\.com(?:\.cn)?$/.test(url.hostname)) return undefined;

  if (CLAUDE_CACHE_MODELS.has(input.model)) {
    return { point: { cachePoint: { type: 'default', ...(input.cacheRetention === 'long' ? { ttl: '1h' } : {}) } }, tools: true };
  }
  if (input.model === 'amazon.nova-pro-v1:0') {
    return { point: { cachePoint: { type: 'default' } }, tools: false, textPrefixLimit: NOVA_CACHE_PREFIX_BYTES };
  }
  return undefined;
}

/** Choose the longest eligible conversation prefix before a user boundary. */
export function appendMessageCachePoint(messages: WireMessage[], point: CachePoint, textBudget?: number): void {
  let candidate: number | undefined;
  for (const [index, message] of messages.entries()) {
    if (textBudget !== undefined) {
      for (const block of message.content) {
        if ('text' in block) textBudget -= Buffer.byteLength(block.text) + NOVA_BLOCK_OVERHEAD;
        else textBudget = -1;
        if (textBudget < 0) break;
      }
      if (textBudget < 0) break;
    }
    if (message.role === 'user' && message.content.length > 0) candidate = index;
  }
  if (candidate !== undefined) {
    const message = messages[candidate]!;
    messages[candidate] = { ...message, content: [...message.content, point] };
  }
}
