import { readFreshConfiguration } from '../configuration.js';
import path from 'node:path';
import { loadCatalog } from '../../models/catalogStore.js';
import { catalogBaseUrl, catalogModel, type CatalogProvider } from '../../models/catalog.js';
import { effortCapability } from '../../models/capability.js';
import { readSessionModel, readSessionModelEdit, writeSessionModel } from '../../../session/model/state.js';
import type { SessionModelPolicy, SessionModelPreset, SessionModelRole } from '../../../session/model/contract.js';
import { type RuntimeConfig } from '../../../config/runtimeConfig.js';
import { sameValue } from '../../../config/values.js';
import type { CommandContext } from '../types.js';
import { setModelTarget } from './selection.js';
import { captureModelChoice } from './choice.js';
import { projectModelSelection, projectSessionModel } from '../../../session/model/projection.js';
import { resolveProviderCredential } from '../../shell/providerCredentials.js';
import { connectionSnapshot } from './identity.js';
import { inspectConfigConstraints } from '../../../config/constraints.js';
import { assertScopedModel } from '../../../config/scope/projection.js';
import { providerFacts } from '../../providers/facts.js';
import { deleteProfilePreset, ProfilePresetError, readProfilePresets, saveProfilePreset } from './presetStore.js';

export interface ModelPresetTarget extends SessionModelRole {}
export function validPresetName(name: string): boolean {
  return /^[a-zA-Z0-9._-]{1,64}$/.test(name) && !['__proto__', 'constructor', 'prototype'].includes(name);
}

/** Validate every role against concrete metadata and configured connections before publication. */
export function validateModelPreset(roles: Readonly<Record<string, ModelPresetTarget>>, config?: RuntimeConfig,
  catalog: readonly CatalogProvider[] = loadCatalog()): string | undefined {
  const entries = Object.entries(roles);
  if (!entries.length) return 'Model preset must contain at least one role.';
  if (entries.length > 16) return 'Model preset exceeds 16 roles.';
  for (const [role, target] of entries) {
    if (!validPresetName(role) || !target || ![target.connectionId, target.provider, target.model].every(value =>
      typeof value === 'string' && value.trim().length > 0 && value.length <= 256)) return 'Model preset contains an invalid role or target.';
    const resolution = config ? resolveProviderCredential({ runtimeConfig: projectModelSelection(config, { ...target, connectionScope: 'session' }) }) : undefined;
    if (!catalogModel(catalog, target.provider, target.model, catalogBaseUrl(catalog, target.provider, resolution?.baseUrl))) return `Model preset refused: ${target.provider}/${target.model} has no verified catalogue entry.`;
    const capability = effortCapability(catalog, target.provider, target.model, target.thinkingEffort ?? null, resolution?.baseUrl);
    if (capability !== 'supported') return `Model preset refused: ${target.provider}/${target.model} reasoning effort ${target.thinkingEffort ?? 'auto'} is ${capability}.`;
    if (config && !config.providerConnections.some(connection => connection.id === target.connectionId
      && connection.provider === target.provider && connection.status === 'connected')) return `Model preset refused: connection '${target.connectionId}' is unavailable or belongs to a different provider.`;
    if (config && resolution) {
      if (resolution.blocked || !resolution.credential) return `Model preset refused: connection '${target.connectionId}' has no usable credential.`;
      const allowed = providerFacts(resolution.provider).accountAuthAllowedModels;
      if (resolution.credential.authMode === 'account-auth' && allowed && !allowed.includes(target.model)) return `Model preset refused: role '${role}' is unavailable for this account binding.`;
      try { assertScopedModel(config, resolution); } catch { return `Model preset refused: role '${role}' is outside the allowed model scope.`; }
      const constraints = inspectConfigConstraints(config, { ...target, baseUrl: resolution.baseUrl }, catalog);
      if (constraints.errors.length) return `Model preset refused: role '${role}': ${constraints.errors.join(' ')}`;
    }
  }
  return undefined;
}

export function saveModelPreset(sessionId: string, name: string, roles: Readonly<Record<string, ModelPresetTarget>>, context?: CommandContext): string {
  if (!validPresetName(name)) return 'Model preset name is invalid.';
  try {
    const baseline = readSessionModelEdit(sessionId);
    const current = baseline.selection;
    if (!current || !baseline.projectRoot) return 'Model preset requires a selected model in this session.';
    const root = context?.projectRoot ?? context?.cwd ?? baseline.projectRoot;
    if (path.resolve(root) !== path.resolve(baseline.projectRoot) || context?.admission?.()) return 'Model preset refused: session or workspace changed.';
    const config = readFreshConfiguration(context ?? { cwd: root });
    const catalog = context?.readConfiguration?.().catalog ?? loadCatalog();
    const failure = validateModelPreset(roles, config, catalog);
    if (failure) return failure;
    if (Object.keys(current.presets ?? {}).length >= 32 && !Object.hasOwn(current.presets ?? {}, name)) return 'Model preset capacity exceeds 32 names.';
    const presets = { ...(current.presets ?? {}), [name]: { roles } satisfies SessionModelPreset };
    writeSessionModel(sessionId, { ...current, presets }, baseline, () => !context?.admission?.()
      && sameValue(connectionSnapshot(readFreshConfiguration(context ?? { cwd: root }).providerConnections), connectionSnapshot(config.providerConnections))
      && !validateModelPreset(roles, readFreshConfiguration(context ?? { cwd: root }), loadCatalog()));
    return `Model preset '${name}' saved for this session and resume.`;
  } catch { return 'Model preset requires a readable selected model; write outcome is unverified if publication was attempted.'; }
}

/** Resolve a name from the session first; a session entry hides the library entry whole. */
export function resolveModelPreset(sessionId: string | undefined, name: string): { readonly preset: SessionModelPreset; readonly source: 'session' | 'profile' } | undefined {
  const session = sessionId ? readSessionModel(sessionId)?.presets?.[name] : undefined;
  if (session) return { preset: session, source: 'session' };
  const profile = readProfilePresets()[name];
  return profile ? { preset: profile, source: 'profile' } : undefined;
}

export function wholePresetFailure(preset: SessionModelPreset): string | undefined {
  if (!preset.roles.default) return 'Whole preset application requires a default role.';
  return Object.keys(preset.roles).some(name => name !== 'default' && name !== 'subagent' && name !== 'summary' && name !== 'advisor')
    ? 'Whole preset application supports default, subagent, summary and advisor roles. Apply other named roles individually; they have no automatic consumer.' : undefined;
}

/** One explicit apply: the default and automatic role policy share the same session transaction. */
export async function applyModelPreset(sessionId: string, name: string, role = 'default', suppliedContext?: CommandContext, whole = false): Promise<string> {
  try {
    const baseline = readSessionModelEdit(sessionId);
    const resolved = resolveModelPreset(sessionId, name);
    const preset = resolved?.preset;
    if (whole && preset && wholePresetFailure(preset)) return wholePresetFailure(preset)!;
    if (whole && role !== 'default') return 'Whole preset application cannot select an individual role.';
    const target = preset?.roles[role];
    if (!preset || !target || !baseline.projectRoot) return `Model preset '${name}' role '${role}' was not found.`;
    const context: CommandContext = suppliedContext ?? { cwd: baseline.projectRoot, projectRoot: baseline.projectRoot, sessionId };
    const choice = captureModelChoice({ ...context, sessionId });
    const { config, catalog } = choice;
    const failure = validateModelPreset(preset.roles, config, catalog);
    if (failure) return failure;
    const unchanged = () => sameValue(resolveModelPreset(sessionId, name), resolved);
    const admission = () => choice.admission() ?? (!unchanged()
      || validateModelPreset(preset.roles, readFreshConfiguration(context), loadCatalog()) ? 'Model preset changed or a role became unavailable.' : undefined);
    const roles: SessionModelPolicy | undefined = whole ? {
      ...(preset.roles.subagent ? { subagent: preset.roles.subagent } : {}),
      ...(preset.roles.summary ? { summary: preset.roles.summary } : {}),
      ...(preset.roles.advisor ? { advisor: preset.roles.advisor } : {}),
    } : undefined;
    const output = await setModelTarget(target, { ...context, sessionId, admission }, baseline, roles);
    if (!output.includes(`Model switched to ${target.model}.`)) return output;
    const effective = projectSessionModel(readFreshConfiguration(context), sessionId);
    const selected = readSessionModel(sessionId);
    if (effective.activeProviderConnectionId !== target.connectionId || selected?.model !== target.model
      || selected.thinkingEffort !== (target.thinkingEffort ?? null)
      || (whole && !sameValue(selected.roles, roles))
      || effective.providerConnections.find(connection => connection.id === target.connectionId)?.model !== target.model) {
      return 'Model preset application is unverified; inspect the effective model before sending.';
    }
    return `Model preset '${name}' ${whole ? 'all roles' : `role '${role}'`} applied for this session from the ${resolved.source} owner.\n${output}`;
  } catch (error) {
    return error instanceof ProfilePresetError ? error.message : 'Model preset application outcome is unverified; inspect the session before retrying.';
  }
}

export function saveProfileModelPreset(name: string, roles: Readonly<Record<string, ModelPresetTarget>>, context?: CommandContext): string {
  if (!validPresetName(name)) return 'Model preset name is invalid.';
  const config = readFreshConfiguration(context ?? { cwd: process.cwd() });
  const failure = validateModelPreset(roles, config, context?.readConfiguration?.().catalog ?? loadCatalog());
  if (failure) return failure;
  try {
    const result = saveProfilePreset(name, { roles });
    return result === 'replaced'
      ? `Model preset '${name}' replaced in this profile's library.`
      : `Model preset '${name}' saved in this profile's library.`;
  } catch (error) { return error instanceof ProfilePresetError ? error.message : 'Model preset library write outcome is unverified.'; }
}

export function promoteModelPreset(sessionId: string, name: string, context?: CommandContext): string {
  const preset = readSessionModel(sessionId)?.presets?.[name];
  if (!preset) return `Session model preset '${name}' was not found.`;
  return saveProfileModelPreset(name, preset.roles, context);
}

export function deleteProfileModelPreset(name: string): string {
  try {
    return deleteProfilePreset(name) === 'deleted'
      ? `Model preset '${name}' deleted from this profile's library.`
      : `Model preset '${name}' was not found in this profile's library.`;
  } catch (error) { return error instanceof ProfilePresetError ? error.message : 'Model preset library delete outcome is unverified.'; }
}

export interface ModelPresetListing {
  readonly name: string;
  readonly source: 'session' | 'profile';
  readonly roles: readonly string[];
  readonly shadowed?: 'profile';
}

export function listModelPresets(sessionId?: string): readonly ModelPresetListing[] {
  const session = sessionId ? readSessionModel(sessionId)?.presets ?? {} : {};
  const profile = readProfilePresets();
  const names = [...new Set([...Object.keys(session), ...Object.keys(profile)])].sort();
  return names.map(name => {
    const preset = session[name] ?? profile[name]!;
    return { name, source: session[name] ? 'session' as const : 'profile' as const, roles: Object.keys(preset.roles),
      ...(session[name] && profile[name] ? { shadowed: 'profile' as const } : {}) };
  });
}
