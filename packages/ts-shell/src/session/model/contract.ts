import type { ThinkingPreference } from '../../core/models/effort.js';

export interface SessionModelRole {
  readonly connectionId: string;
  readonly provider: string;
  readonly model: string;
  readonly thinkingEffort?: ThinkingPreference;
}

export interface SessionModelPreset {
  readonly roles: Readonly<Record<string, SessionModelRole>>;
}

/** Automatic consumers supported by the runtime; arbitrary names remain manual preset roles. */
export interface SessionModelPolicy {
  readonly subagent?: SessionModelRole;
  readonly summary?: SessionModelRole;
  readonly advisor?: SessionModelRole;
}

/** A provider-slot choice cannot be mistaken for a missing named connection. */
export interface ProviderModelTarget {
  readonly connectionScope: 'provider';
  readonly connectionId?: never;
  readonly provider: string;
  readonly model: string;
  readonly thinkingEffort?: ThinkingPreference;
}

export type SessionModelTarget = SessionModelRole | ProviderModelTarget;

/** Preferences contain no credential; legacy named selections keep their original scope. */
export type SessionModelSelection = (ProviderModelTarget | (SessionModelRole & {
  readonly connectionScope?: 'session';
})) & {
  /** Provider service tier for this session, when the active model advertises it. */
  readonly serviceTier?: string;
  readonly presets?: Readonly<Record<string, SessionModelPreset>>;
  /** Active role assignments, replaced together with the default model by whole-preset application. */
  readonly roles?: SessionModelPolicy;
  /** Session-only prompt skill listing override; undefined follows startup default. */
  readonly skillful?: boolean;
  /** Session-only context window selection from the provider/model catalog. */
  readonly contextWindow?: number;
}
