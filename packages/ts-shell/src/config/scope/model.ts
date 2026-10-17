import type { ConfigSource } from '../fields.js';
import type { ConfigOrigin } from '../provenance/model.js';
import type { ConfigFileOrigin } from '../provenance/files.js';
import type { ProfileContext } from '../../core/paths/profile/context.js';
import type { ScopeSettings } from './contract.js';
import type { ScopePath } from './path.js';

export interface ScopeRule {
  readonly path: ScopePath;
  readonly position: number;
  readonly settings: ScopeSettings;
  readonly origins: Readonly<Record<string, ConfigOrigin>>;
}
export interface ScopeLayer {
  readonly source: ConfigSource;
  readonly base: ScopeSettings;
  readonly origins: Readonly<Record<string, ConfigOrigin>>;
  readonly file?: ConfigFileOrigin;
  readonly declaration?: ScopePath;
  readonly rules: readonly ScopeRule[];
}
export interface ConfigScopes {
  readonly revision: string;
  readonly profile?: ProfileContext;
  readonly home: string;
  readonly workspace: ScopePath;
  readonly defaults: ScopeSettings;
  readonly layers: readonly ScopeLayer[];
}
