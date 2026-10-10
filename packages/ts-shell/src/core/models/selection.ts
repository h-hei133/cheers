import type { ThinkingPreference } from './effort.js';

/** A turn-local selection on an already captured provider connection. */
export interface ModelChoice {
  readonly provider: string;
  readonly model: string;
  readonly thinkingEffort: ThinkingPreference;
  readonly connectionId?: string;
}
