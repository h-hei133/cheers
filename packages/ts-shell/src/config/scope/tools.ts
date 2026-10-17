import { freezeDeep } from '../../core/values/freeze.js';
import type { RuntimeConfig } from '../runtimeConfig.js';
import { CONFIG_FIELDS } from '../runtimeConfig.js';
import { mergeConfigValue } from '../merge.js';
import type { ConfigScopes } from './model.js';
import type { ScopeField, ScopeSettings } from './contract.js';
import { SCOPE_FIELDS } from './registry.js';
import { resolveConfigTargets } from './resolution.js';
import { assertScopePath } from './path.js';
import { assertConfigScopes } from './capture.js';
import { sameValue } from '../values.js';

export interface ToolScopeBinding {
  readonly scopes: ConfigScopes;
  readonly session: ScopeSettings;
}

/** Only restrictions cross into the tool gate; provider values never enter its binding. */
export function toolScopeBinding(config: RuntimeConfig | undefined): ToolScopeBinding | undefined {
  if (!config?.configScopes) return undefined;
  const session = Object.fromEntries(Object.entries(SCOPE_FIELDS).filter(([, value]) => (value.basis as readonly string[]).includes('target'))
    .map(([key]) => [key, config[key as ScopeField]]).filter(([, value]) => value !== undefined));
  return freezeDeep({ scopes: config.configScopes, session });
}

export function captureToolScope(binding: ToolScopeBinding, targets: readonly string[]) {
  const resolved = resolveConfigTargets(binding.scopes, targets);
  const settings = meetToolScopes([binding.session, resolved.settings]);
  const assert = () => {
    assertConfigScopes(binding.scopes);
    for (const resolution of resolved.resolutions) assertScopePath(resolution.path);
  };
  assert();
  return { settings, assert };
}

export function meetToolScopes(scopes: readonly ScopeSettings[]): ScopeSettings {
  const settings: Record<string, unknown> = {};
  for (const scope of scopes) for (const [key, value] of Object.entries(scope)) {
    const field = CONFIG_FIELDS[key as ScopeField];
    if (!field.security && Object.hasOwn(settings, key) && !sameValue(settings[key], value)) throw new Error('Configuration scopes conflict; split the operation.');
    settings[key] = mergeConfigValue(settings[key], value, field.merge);
  }
  if (settings.denyRules) settings.denyRules = [...new Map((settings.denyRules as object[]).map(rule => [JSON.stringify(rule), rule])).values()];
  return freezeDeep(settings as ScopeSettings);
}

export function assertScopeToolAllowed(settings: ScopeSettings, tool: string): void {
  if (settings.allowedTools !== undefined && !settings.allowedTools.includes(tool) || settings.disabledTools?.includes(tool)
    || settings.hiddenToolPrefixes?.some(prefix => tool.startsWith(prefix)) || tool.startsWith('mcp__') && settings.enableMcpTools === false) {
    throw new Error('The selected tool is disabled in this configuration scope.');
  }
}
