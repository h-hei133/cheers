import { settingsSyntax } from './settings/syntax.js';
import { syntaxHelp } from './syntax/projection.js';
import { parseSyntax } from './syntax/parse.js';
import { CONFIG_SETTINGS, settingDefinition } from '../../config/settings.js';
import type { CommandContext, LocalCommandResult } from './types.js';

/** The command describes the same editable registry as the interactive panel. */
export async function runSettingsCommand(args: string[], _context: CommandContext): Promise<LocalCommandResult> {
  const parsed = parseSyntax(settingsSyntax, args);
  if (!parsed.ok) return { kind: 'local', output: `Invalid /settings arguments: ${parsed.reason}\n${syntaxHelp(settingsSyntax)}` };
  const setting = settingDefinition(parsed.action.name);
  if (setting) return { kind: 'local', output: [
    `### ${setting.key}`, '', setting.description, '',
    `Group: ${setting.group}. Input: ${setting.schema.type}. Applies: ${setting.policy.application}.`,
    `Editable scope: ${setting.policy.sources.filter(source => source === 'user' || source === 'project').join(', ')}. Merge: ${setting.policy.merge}.`,
    'Open /settings, select the field, stage a value, and choose Apply to save. Selecting a row does not save.',
  ].join('\n') };
  return { kind: 'local', output: [
    '### Settings', '', 'Open /settings in an interactive session. Type to search by field, group or description.',
    'Choose a field and save scope, stage a value, then choose Apply. Credentials stay in /connect.', '',
    '| Group | Setting | What it does |', '| :--- | :--- | :--- |',
    ...CONFIG_SETTINGS.map(item => `| ${item.group} | ${item.key} | ${item.description} |`), '',
    'Details: /settings <name>. This command does not write configuration.',
  ].join('\n') };
}
