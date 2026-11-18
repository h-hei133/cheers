/** Requested caching is independent of the endpoint's supported wire controls. */
export type CacheRetention = 'short' | 'long' | 'none';

/** Effective protocol choice captured with one request; an absent window stays unknown. */
export interface CacheWindow {
  readonly retention: CacheRetention;
  readonly ttlMs?: number;
}
