import path from 'node:path';
import { freezeDeep } from '../../core/values/freeze.js';
import { CONFIG_FIELDS } from '../runtimeConfig.js';
import { mergeConfigValue } from '../merge.js';
import { sameValue } from '../values.js';
import { mergeOrigin } from '../provenance/merge.js';
import { origin, traceValue, type ConfigOrigin } from '../provenance/model.js';
import { assertConfigScopes } from './capture.js';
import type { ScopeBasis, ScopeField, ScopeSettings } from './contract.js';
import type { ConfigScopes, ScopeRule } from './model.js';
import { SCOPE_FIELDS } from './registry.js';
import { assertScopePath, captureScopePath, scopeContains, type ScopePath } from './path.js';

export interface ScopeResolution {
  readonly revision: string;
  readonly path: ScopePath;
  readonly settings: ScopeSettings;
  readonly origins: Readonly<Record<string, ConfigOrigin>>;
  readonly matches: readonly { readonly prefix: string; readonly position: number; readonly file?: string; readonly source: string; readonly fields: readonly string[] }[];
  readonly diagnostics: readonly string[];
}

function applies(key: string, basis: ScopeBasis): key is ScopeField {
  return Object.hasOwn(SCOPE_FIELDS, key) && (SCOPE_FIELDS[key as ScopeField].basis as readonly ScopeBasis[]).includes(basis);
}

function apply(settings: Record<string, unknown>, origins: Record<string, ConfigOrigin>, values: ScopeSettings,
  incoming: Readonly<Record<string, ConfigOrigin>>, basis: ScopeBasis): void {
  for (const [key, value] of Object.entries(values)) {
    if (!applies(key, basis)) continue;
    const before = settings[key];
    settings[key] = mergeConfigValue(before, value, CONFIG_FIELDS[key].merge);
    origins[key] = mergeOrigin(before, value, settings[key], origins[key], incoming[key] ?? origin('derived'), CONFIG_FIELDS[key].merge);
  }
  for (const [key, trace] of Object.entries(incoming)) {
    if (applies(key, basis) && values[key] === undefined && trace.rejected.length) {
      const previous = origins[key] ?? origin('default');
      origins[key] = { ...previous, rejected: [...previous.rejected, ...trace.rejected],
        rejectedFiles: [...previous.rejectedFiles ?? [], ...trace.rejectedFiles ?? []] };
    }
  }
}

function ordered(rules: readonly ScopeRule[], target: string): ScopeRule[] {
  return rules.filter(rule => scopeContains(rule.path.canonical, target))
    .sort((left, right) => left.path.canonical.split(path.sep).length - right.path.canonical.split(path.sep).length || left.position - right.position);
}

/** Each source applies its base and broad-to-narrow rules before the next source. */
export function resolveConfigScope(scopes: ConfigScopes, target: string, basis: ScopeBasis = 'session'): ScopeResolution {
  assertConfigScopes(scopes);
  const selected = captureScopePath(target, scopes.workspace.canonical);
  const settings: Record<string, unknown> = {};
  const origins: Record<string, ConfigOrigin> = {};
  const matches: ScopeResolution['matches'][number][] = [];
  const diagnostics: string[] = [];
  const defaults = Object.fromEntries(Object.entries(scopes.defaults).map(([key, value]) => [key, traceValue(value, CONFIG_FIELDS[key as ScopeField].schema, 'default')]));
  apply(settings, origins, scopes.defaults, defaults, basis);
  for (const layer of scopes.layers) {
    apply(settings, origins, layer.base, layer.origins, basis);
    const seen = new Set<string>();
    for (const rule of ordered(layer.rules, selected.canonical)) {
      if (seen.has(rule.path.canonical)) diagnostics.push('Equivalent configuration scope prefixes use declaration order.');
      seen.add(rule.path.canonical);
      apply(settings, origins, rule.settings, rule.origins, basis);
      matches.push({ prefix: rule.path.canonical, position: rule.position, file: layer.file?.path, source: layer.source,
        fields: Object.keys(rule.settings).filter(key => applies(key, basis)) });
    }
  }
  assertScopePath(selected); assertConfigScopes(scopes);
  return freezeDeep({ revision: scopes.revision, path: selected, settings, origins, matches, diagnostics });
}

/** Restrictions meet for every target; incompatible ordinary values have no implicit winner. */
export function resolveConfigTargets(scopes: ConfigScopes, targets: readonly string[], basis: ScopeBasis = 'target') {
  if (!targets.length || targets.length > 256) throw new Error('Configuration scope requires a bounded, nonempty target set.');
  const resolutions = targets.map(target => resolveConfigScope(scopes, target, basis));
  const settings: Record<string, unknown> = {};
  for (const resolution of resolutions) {
    for (const [key, value] of Object.entries(resolution.settings)) {
      const field = CONFIG_FIELDS[key as ScopeField];
      if (!field.security && Object.hasOwn(settings, key) && !sameValue(settings[key], value)) throw new Error('Configuration scopes have conflicting operation settings; split the operation.');
      settings[key] = field.security ? mergeConfigValue(settings[key], value, field.merge) : value;
    }
  }
  return freezeDeep({ settings: settings as ScopeSettings, resolutions });
}
