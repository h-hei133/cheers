import { readProjectState } from '../state/projectState.js';
import type { ThinkingPreference } from './effort.js';
import type { RuntimeConfig } from '../../config/runtimeConfig.js';

export interface ModelPreferenceBinding {
  readonly provider: string;
  readonly model: string;
  readonly connectionId?: string;
  readonly connectionScope?: 'session' | 'provider';
}

export interface ModelPreferenceTarget {
  readonly provider: string;
  readonly model?: string;
  readonly credential?: { readonly connectionId?: string };
  readonly blocked?: unknown;
}

/** Session preferences follow the exact model and its admitted credential namespace. */
export function sessionPreferenceMatches(config: Partial<Pick<RuntimeConfig, 'activeProviderConnectionId'>> | undefined,
  preference: ModelPreferenceBinding | undefined,
  resolution: ModelPreferenceTarget): boolean {
  const connectionId = resolution.credential?.connectionId;
  return Boolean(preference && resolution.credential && !resolution.blocked
    && preference.provider === resolution.provider && preference.model === resolution.model
    && (preference.connectionId === connectionId || (preference.connectionScope === undefined && connectionId === undefined
      && preference.connectionId === config?.activeProviderConnectionId)));
}

/** Legacy project preferences are read once at the operation boundary. */
export function captureThinkingPreference(workspaceRoot: string, preference?: ThinkingPreference) {
  return { thinkingEffort: preference === undefined ? readProjectState(workspaceRoot).thinkingEffort ?? null : preference,
    thinkingEffortExplicit: preference !== undefined };
}
