import { loadCatalog } from '../../models/catalogStore.js';
import { catalogModel } from '../../models/catalog.js';
import { isThinkingPreference, type ThinkingPreference } from '../../models/effort.js';
import { readSessionModel } from '../../../session/model/state.js';
import type { SessionModelRole } from '../../../session/model/contract.js';
import { applyModelPreset, saveModelPreset, validateModelPreset, validPresetName } from './preset.js';
import type { CommandContext, LocalCommandResult } from '../types.js';
import { parseSyntax } from '../syntax/parse.js';
import { syntaxHelp } from '../syntax/projection.js';
import { modelPresetSyntax } from './presetSyntax.js';
import { configurationApplicationNotice, readFreshConfiguration } from '../configuration.js';

/** Run the session-scoped model preset owner. Presets never write global config. */
export async function runModelPresetCommand(args: string[], context: CommandContext): Promise<LocalCommandResult> {
  const parsed = parseSyntax(modelPresetSyntax, args);
  if (!parsed.ok) return { kind: 'local', output: `Invalid /modelpreset arguments: ${parsed.reason}\n${syntaxHelp(modelPresetSyntax)}` };
  const sessionId = context.sessionId;
  const selection = sessionId ? readSessionModel(sessionId) : undefined;
  const action = parsed.action.name;
  if (action === 'status' || action === 'list') {
    if (!selection) return { kind: 'local', output: 'Model presets require an active selected model in this session.' };
    const presets = Object.entries(selection.presets ?? {});
    if (presets.length === 0) return { kind: 'local', output: 'No model presets are saved for this session.' };
    return { kind: 'local', output: ['Session model presets', ...presets.map(([name, preset]) => `- ${name}: ${Object.keys(preset.roles).join(', ')}`)].join('\n') };
  }
  if (!sessionId || !selection) return { kind: 'local', output: 'Model presets require an active selected model in this session; no global preference was changed.' };
  const name = parsed.args[0]?.trim();
  if (!name) return { kind: 'local', output: `Invalid /modelpreset arguments: Missing name.\n${syntaxHelp(modelPresetSyntax)}` };
  if (action === 'apply' || action === 'use') {
    const output = await applyModelPreset(sessionId, name, parsed.args[1]?.trim() || 'default', context);
    return { kind: 'local', output };
  }
  if (action === 'validate') {
    const preset = selection.presets?.[name];
    if (!preset) return { kind: 'local', output: `Model preset '${name}' was not found.` };
    const failure = validateModelPreset(preset.roles, context.readConfiguration?.().config ?? context.runtimeConfig
      ?? readFreshConfiguration(context), context.readConfiguration?.().catalog ?? loadCatalog());
    return { kind: 'local', output: failure ? failure : `Model preset '${name}' is valid for the current catalogue.` };
  }
  if (action === 'save') {
    const roles = parsePresetRoles(context, selection, parsed.args.slice(1));
    if (!roles.ok) return { kind: 'local', output: roles.reason };
    return { kind: 'local', output: saveModelPreset(sessionId, name, roles.roles, context) };
  }
  return { kind: 'local', output: `Unknown /modelpreset action: ${action}\n${syntaxHelp(modelPresetSyntax)}` };
}

type RoleParseResult =
  | { readonly ok: true; readonly roles: Readonly<Record<string, SessionModelRole>> }
  | { readonly ok: false; readonly reason: string };

function parsePresetRoles(context: CommandContext, selection: SessionModelRole, specs: readonly string[]): RoleParseResult {
  if (specs.length === 0) return { ok: true, roles: { default: selection } };
  const config = context.runtimeConfig ?? readFreshConfiguration(context);
  const catalog = loadCatalog();
  const roles: Record<string, SessionModelRole> = {};
  for (const spec of specs) {
    const separator = spec.indexOf('=');
    if (separator <= 0 || separator === spec.length - 1) return { ok: false, reason: `Invalid preset role '${spec}'. Use role=provider/model[@effort].` };
    const role = spec.slice(0, separator);
    const target = spec.slice(separator + 1);
    if (!validPresetName(role) || Object.hasOwn(roles, role)) return { ok: false, reason: `Invalid or duplicate preset role '${role}'.` };
    const effortSplit = target.lastIndexOf('@');
    const modelTarget = effortSplit > 0 ? target.slice(0, effortSplit) : target;
    const effortText = effortSplit > 0 ? target.slice(effortSplit + 1).toLowerCase() : undefined;
    const effort = effortText === undefined ? selection.thinkingEffort : parseEffort(effortText);
    if (effort === 'invalid') return { ok: false, reason: `Invalid reasoning effort in '${spec}'.` };
    const providerSeparator = modelTarget.indexOf('/');
    const candidateProvider = providerSeparator > 0 ? modelTarget.slice(0, providerSeparator) : selection.provider;
    const configuredProvider = config.providerConnections?.some(item => item.provider === candidateProvider)
      || Object.hasOwn(config.providerCredentials ?? {}, candidateProvider);
    const provider = catalog.some(entry => entry.id === candidateProvider) || configuredProvider
      ? candidateProvider
      : selection.provider;
    const model = provider === candidateProvider && providerSeparator > 0 ? modelTarget.slice(providerSeparator + 1) : modelTarget;
    if (!model.trim()) return { ok: false, reason: `Invalid preset target '${spec}'.` };
    const connection = (provider === selection.provider
      ? config.providerConnections?.find(item => item.id === selection.connectionId)
      : undefined)
      ?? config.providerConnections?.find(item => item.provider === provider);
    if (!connection) return { ok: false, reason: `No saved connection exists for provider '${provider}'.` };
    roles[role] = { connectionId: connection.id, provider, model: model.trim(), ...(effort !== undefined ? { thinkingEffort: effort } : {}) };
    const entry = catalogModel(catalog, provider, model);
    if (entry?.id && !entry.id.trim()) return { ok: false, reason: `Invalid catalogue model for '${spec}'.` };
  }
  return { ok: true, roles };
}

function parseEffort(value: string): ThinkingPreference | 'invalid' {
  if (value === 'auto' || value === 'off' || value === 'none') return null;
  return isThinkingPreference(value) ? value : 'invalid';
}
