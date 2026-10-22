import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { CommandContext, LocalCommandResult } from '../../core/commands/types.js';
import { parseSyntax } from '../../core/commands/syntax/parse.js';
import { settingsSyntax } from '../../core/commands/settings/syntax.js';
import { parseSettingInput, settingDefinition, validateSetting } from '../../config/settings.js';
import { openSettings } from '../interactive/settings.js';

/**
 * Explicit noninteractive save for scripted acceptance and line/pipe hosts.
 *
 * This is intentionally one-shot and delegates to the same baseline/CAS writer
 * as the settings panel; it does not introduce a second configuration store.
 */
export function settingsCommandFor(context: ShellRuntimeContext): NonNullable<CommandContext['settingsCommand']> {
  return async (args, command): Promise<LocalCommandResult> => {
    if (command.sessionId !== context.session.id || command.projectRoot !== context.projectRoot) {
      return { kind: 'local', output: 'Settings save refused: the current session or project changed.' };
    }
    const parsed = parseSyntax(settingsSyntax, args);
    if (!parsed.ok || parsed.action.name !== 'set') {
      return { kind: 'local', output: `Invalid /settings set arguments${parsed.ok ? '' : `: ${parsed.reason}`}.` };
    }
    const key = parsed.args[0];
    const setting = key ? settingDefinition(key) : undefined;
    if (!setting) return { kind: 'local', output: 'Unknown setting key.' };
    const raw = parsed.args.slice(1).join(' ');
    let input = parseSettingInput(setting, raw);
    // Choice/theme values may be written as plain text in scripted hosts.
    if (!input.ok && (setting.schema.type === 'string' || setting.choices)) {
      const value = raw.trim();
      const invalid = validateSetting(setting, value);
      if (!invalid) input = { ok: true, value };
    }
    if (!input.ok) return { kind: 'local', output: input.error ?? 'Invalid setting value.' };
    const scope = parsed.flags.has('project') ? 'project' : 'user';
    const draft = openSettings(context, () => undefined, scope);
    const result = await draft.save(setting.key, input.value);
    return { kind: 'local', output: result.note };
  };
}
