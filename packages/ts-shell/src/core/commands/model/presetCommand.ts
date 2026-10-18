import { loadCatalog } from '../../models/catalogStore.js';
import { readSessionModel } from '../../../session/model/state.js';
import { applyModelPreset, deleteProfileModelPreset, listModelPresets, promoteModelPreset, resolveModelPreset,
  saveModelPreset, saveProfileModelPreset, validateModelPreset } from './preset.js';
import { ProfilePresetError } from './presetStore.js';
import type { CommandContext, LocalCommandResult } from '../types.js';
import { parseSyntax } from '../syntax/parse.js';
import { syntaxHelp } from '../syntax/projection.js';
import { modelPresetSyntax } from './presetSyntax.js';
import { readFreshConfiguration } from '../configuration.js';
import { parsePresetRoles } from './roles.js';

/** Run the session-scoped model preset owner. Presets never write global config. */
export async function runModelPresetCommand(args: string[], context: CommandContext): Promise<LocalCommandResult> {
  const parsed = parseSyntax(modelPresetSyntax, args);
  if (!parsed.ok) return { kind: 'local', output: `Invalid /modelpreset arguments: ${parsed.reason}\n${syntaxHelp(modelPresetSyntax)}` };
  const sessionId = context.sessionId;
  const selection = sessionId ? readSessionModel(sessionId) : undefined;
  const action = parsed.action.name;
  if (parsed.flags.has('all') && action !== 'apply') return { kind: 'local', output: '--all is only valid when applying a preset.' };
  if (action === 'status' || action === 'list') {
    try {
      const presets = listModelPresets(sessionId);
      if (presets.length === 0) return { kind: 'local', output: 'No model presets are saved for this session or profile.' };
      return { kind: 'local', output: ['Model presets', ...presets.map(preset =>
        `- ${preset.name} [${preset.source}]${preset.shadowed ? ' (hides profile entry)' : ''}: ${preset.roles.join(', ')}`)].join('\n') };
    } catch (error) { return { kind: 'local', output: error instanceof ProfilePresetError ? error.message : 'Model preset library could not be read.' }; }
  }
  const name = parsed.args[0]?.trim();
  if (!name) return { kind: 'local', output: `Invalid /modelpreset arguments: Missing name.\n${syntaxHelp(modelPresetSyntax)}` };
  if (action === 'delete') {
    const output = deleteProfileModelPreset(name);
    return { kind: 'local', output: selection?.presets?.[name] ? `${output}\nThe session preset '${name}' remains available.` : output };
  }
  if (action === 'apply' || action === 'use') {
    if (!sessionId) return { kind: 'local', output: 'Applying a model preset requires an active session.' };
    if (parsed.flags.has('all') && parsed.args[1]) return { kind: 'local', output: 'Use --all without an individual role.' };
    const output = await applyModelPreset(sessionId, name, parsed.args[1]?.trim() || 'default', context, parsed.flags.has('all'));
    return { kind: 'local', output };
  }
  if (action === 'promote') return { kind: 'local', output: sessionId ? promoteModelPreset(sessionId, name, context) : 'Promoting a model preset requires an active session.' };
  if (action === 'validate') {
    let resolved;
    try { resolved = resolveModelPreset(sessionId, name); }
    catch (error) { return { kind: 'local', output: error instanceof ProfilePresetError ? error.message : 'Model preset library could not be read.' }; }
    if (!resolved) return { kind: 'local', output: `Model preset '${name}' was not found.` };
    const failure = validateModelPreset(resolved.preset.roles, context.readConfiguration?.().config ?? context.runtimeConfig
      ?? readFreshConfiguration(context), context.readConfiguration?.().catalog ?? loadCatalog());
    return { kind: 'local', output: failure ? failure : `Model preset '${name}' from the ${resolved.source} owner is valid for the current catalogue.` };
  }
  if (action === 'save') {
    const roles = parsePresetRoles(context, selection, parsed.args.slice(1));
    if (!roles.ok) return { kind: 'local', output: roles.reason };
    if (!parsed.flags.has('profile') && !sessionId) return { kind: 'local', output: 'Saving a session preset requires an active selected model.' };
    return { kind: 'local', output: parsed.flags.has('profile')
      ? saveProfileModelPreset(name, roles.roles, context)
      : saveModelPreset(sessionId!, name, roles.roles, context) };
  }
  return { kind: 'local', output: `Unknown /modelpreset action: ${action}\n${syntaxHelp(modelPresetSyntax)}` };
}
