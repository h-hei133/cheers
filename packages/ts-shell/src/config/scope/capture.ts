import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { currentProfile, assertCurrentProfile } from '../../core/paths/profile/context.js';
import { userHomeDir } from '../../core/paths/userHome.js';
import { freezeDeep } from '../../core/values/freeze.js';
import type { ConfigOrigin } from '../provenance/model.js';
import type { ConfigFileOrigin } from '../provenance/files.js';
import { ConfigInputError } from '../inputs/model.js';
import type { ConfigSource } from '../fields.js';
import { normalizeConfigDenials } from '../values.js';
import type { ConfigScopes, ScopeLayer } from './model.js';
import type { PathRule, ScopeSettings } from './contract.js';
import { SCOPE_FIELDS } from './registry.js';
import { assertScopePath, captureScopePath } from './path.js';

export const MAX_SCOPE_RULES = 128;

export function scopeSettings(values: object): ScopeSettings {
  const settings: ScopeSettings = Object.fromEntries(Object.entries(values).filter(([key, value]) => Object.hasOwn(SCOPE_FIELDS, key) && value !== undefined));
  return settings.denyRules ? { ...settings, denyRules: normalizeConfigDenials(settings.denyRules) } : settings;
}

/** Field validation stays in layers; capture only fixed declaration and path identities. */
export function captureScopeLayer(base: ScopeSettings, origins: Readonly<Record<string, ConfigOrigin>>, raw: readonly PathRule[],
  source: ConfigSource, file: ConfigFileOrigin | undefined, workspace: string,
  validate: (settings: ScopeSettings, file?: ConfigFileOrigin) => { readonly settings: ScopeSettings; readonly origins: Readonly<Record<string, ConfigOrigin>> }): ScopeLayer {
  try {
    const declaration = raw.length ? captureScopePath(source === 'project' ? workspace : path.dirname(file!.path), workspace, true) : undefined;
    const rules = raw.map((rule, position) => {
      const selected = captureScopePath(rule.path, declaration!.canonical, true);
      const result = validate(rule.settings, file ? { ...file, rule: position, scope: selected.canonical } : undefined);
      return { path: selected, position, settings: result.settings, origins: result.origins };
    });
    return { source, base, origins, ...(file ? { file } : {}), ...(declaration ? { declaration } : {}), rules };
  } catch { throw new ConfigInputError('scope-path-unverified', file?.path); }
}

export function captureConfigScopes(layers: readonly ScopeLayer[], defaults: ScopeSettings, workspace: string): ConfigScopes | undefined {
  if (!layers.some(layer => layer.rules.length)) return undefined;
  if (layers.reduce((sum, layer) => sum + layer.rules.length, 0) > MAX_SCOPE_RULES) throw new ConfigInputError('scope-resource-limit');
  const program: ConfigScopes = { revision: createHash('sha256').update(JSON.stringify(layers)).digest('hex'),
    profile: currentProfile(), home: fs.realpathSync(userHomeDir()), workspace: captureScopePath(workspace, workspace, true),
    defaults: structuredClone(defaults), layers: structuredClone(layers) };
  assertConfigScopes(program);
  return freezeDeep(program);
}

/** No reread or ambient current-scope lookup can replace a captured program. */
export function assertConfigScopes(scopes: ConfigScopes): void {
  try {
    if (scopes.profile) assertCurrentProfile(scopes.profile);
    else if (currentProfile() || fs.realpathSync(userHomeDir()) !== scopes.home) throw new Error();
    assertScopePath(scopes.workspace);
    for (const layer of scopes.layers) {
      if (layer.declaration) assertScopePath(layer.declaration);
      for (const rule of layer.rules) assertScopePath(rule.path);
    }
  } catch { throw new Error('Configuration scope identity changed; reload in the owning session and profile.'); }
}
