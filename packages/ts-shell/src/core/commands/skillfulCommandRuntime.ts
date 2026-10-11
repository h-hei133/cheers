import type { CommandContext, LocalCommandResult } from './types.js';
import { readSessionModel } from '../../session/model/state.js';
import { parseSyntax } from './syntax/parse.js';
import { syntaxHelp } from './syntax/projection.js';
import { skillfulSyntax } from './skillful/syntax.js';
import { publishModelPreference } from './model/preferences.js';

/** Persist the session skill-listing override; prompt assembly consumes this value. */
export async function runSkillfulCommand(args: string[], context: CommandContext): Promise<LocalCommandResult> {
  const parsed = parseSyntax(skillfulSyntax, args);
  if (!parsed.ok) return { kind: 'local', output: `Invalid /skillful arguments: ${parsed.reason}\n${syntaxHelp(skillfulSyntax)}` };
  const action = parsed.action.name;
  const selection = context.sessionId ? readSessionModel(context.sessionId) : undefined;
  if (!action || action === 'status') return { kind: 'local', output: `Skill listing: ${selection?.skillful === false ? 'off' : 'on'} (session override).` };
  if (!context.sessionId || !selection) return { kind: 'local', output: 'Skillful requires an active selected model; no setting was changed.' };
  const enabled = action === 'on' || action === 'enable' ? true : action === 'off' || action === 'disable' ? false : action === 'toggle' ? selection.skillful === false : undefined;
  if (enabled === undefined) return { kind: 'local', output: 'Usage: /skillful [on|off|toggle|status]' };
  const refusal = publishModelPreference(context, selected => ({ ...selected, skillful: enabled }));
  return { kind: 'local', output: refusal ?? `Skill listing ${enabled ? 'enabled' : 'disabled'} for this session.` };
}
