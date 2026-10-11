import path from 'node:path';
import { loadCatalog } from '../../models/catalogStore.js';
import { catalogModel, type CatalogProvider } from '../../models/catalog.js';
import { effortCapability } from '../../models/capability.js';
import { readSessionModel, readSessionModelEdit, writeSessionModel } from '../../../session/model/state.js';
import type { SessionModelPreset, SessionModelRole } from '../../../session/model/contract.js';
import { getRuntimeConfig, type RuntimeConfig } from '../../../config/runtimeConfig.js';
import { sameValue } from '../../../config/values.js';
import type { CommandContext } from '../types.js';
import { setModel } from './selection.js';
import { projectSessionModel } from '../../../session/model/projection.js';
import { connectionSnapshot } from './identity.js';

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
    if (!catalogModel(catalog, target.provider, target.model)) return `Model preset refused: ${target.provider}/${target.model} has no verified catalogue entry.`;
    const capability = effortCapability(catalog, target.provider, target.model, target.thinkingEffort ?? null);
    if (capability !== 'supported') return `Model preset refused: ${target.provider}/${target.model} reasoning effort ${target.thinkingEffort ?? 'auto'} is ${capability}.`;
    if (config && !config.providerConnections.some(connection => connection.id === target.connectionId
      && connection.provider === target.provider && connection.status === 'connected')) return `Model preset refused: connection '${target.connectionId}' is unavailable or belongs to a different provider.`;
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
    const config = getRuntimeConfig(root);
    const catalog = context?.readConfiguration?.().catalog ?? loadCatalog();
    const failure = validateModelPreset(roles, config, catalog);
    if (failure) return failure;
    if (Object.keys(current.presets ?? {}).length >= 32 && !Object.hasOwn(current.presets ?? {}, name)) return 'Model preset capacity exceeds 32 names.';
    const presets = { ...(current.presets ?? {}), [name]: { roles } satisfies SessionModelPreset };
    writeSessionModel(sessionId, { ...current, presets }, baseline, () => !context?.admission?.()
      && sameValue(connectionSnapshot(getRuntimeConfig(root).providerConnections), connectionSnapshot(config.providerConnections))
      && !validateModelPreset(roles, getRuntimeConfig(root), loadCatalog()));
    return `Model preset '${name}' saved for this session and resume.`;
  } catch { return 'Model preset requires a readable selected model; write outcome is unverified if publication was attempted.'; }
}

/** The ordinary model owner applies only a role on the currently active connection. */
export async function applyModelPreset(sessionId: string, name: string, role = 'default', suppliedContext?: CommandContext): Promise<string> {
  try {
    const baseline = readSessionModelEdit(sessionId);
    const current = baseline.selection;
    const preset = current?.presets?.[name];
    const target = preset?.roles[role];
    if (!current || !target || !baseline.projectRoot) return `Model preset '${name}' role '${role}' was not found.`;
    const context: CommandContext = suppliedContext ?? { cwd: baseline.projectRoot, projectRoot: baseline.projectRoot, sessionId };
    const root = context.projectRoot ?? context.cwd;
    const config = context.readConfiguration?.().config ?? context.runtimeConfig ?? projectSessionModel(getRuntimeConfig(root), sessionId);
    const catalog = context.readConfiguration?.().catalog ?? loadCatalog();
    const failure = validateModelPreset(preset!.roles, config, catalog);
    if (failure) return failure;
    if (config.activeProviderConnectionId !== target.connectionId) return `Model preset refused: select connection '${target.connectionId}' with /connect use before applying this role.`;
    const admission = () => context.admission?.() ?? (!sameValue(readSessionModel(sessionId)?.presets?.[name], preset)
      || validateModelPreset(preset!.roles, getRuntimeConfig(root), loadCatalog()) ? 'Model preset changed or a role became unavailable.' : undefined);
    const output = await setModel([`${target.provider}/${target.model}`], { ...context, sessionId, admission }, false, target.thinkingEffort ?? null);
    if (!output.includes(`Model switched to ${target.model}.`)) return output;
    const effective = projectSessionModel(getRuntimeConfig(root), sessionId);
    const selected = readSessionModel(sessionId);
    if (effective.activeProviderConnectionId !== target.connectionId || selected?.model !== target.model
      || selected.thinkingEffort !== (target.thinkingEffort ?? null)
      || effective.providerConnections.find(connection => connection.id === target.connectionId)?.model !== target.model) {
      return 'Model preset application is unverified; inspect the effective model before sending.';
    }
    return `Model preset '${name}' role '${role}' applied for this session.\n${output}`;
  } catch { return 'Model preset application outcome is unverified; inspect the session before retrying.'; }
}
