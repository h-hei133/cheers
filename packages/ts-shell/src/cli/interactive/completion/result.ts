import type { Suggestion } from '../../../presentation/tui/chrome/suggestions.js';

/** Known candidates can arrive before discovery is complete; the notice preserves that boundary. */
export interface CatalogProgress {
  readonly items: readonly Suggestion[];
  readonly status?: string;
}

export type CatalogProgressSink = (progress: CatalogProgress) => void;
