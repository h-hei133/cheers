import type { CommandExecutionResult } from '../types.js';
import type { CommandSyntax } from '../syntax/model.js';
import { parseSyntax } from '../syntax/parse.js';
import { syntaxHelp } from '../syntax/projection.js';

export const renameSyntax: CommandSyntax = { name: 'rename', defaultAction: '', actions: [
  { name: '', summary: 'rename the current session, or open its title editor', parameters: [{ name: 'title', kind: 'text', rest: true }], flags: [] },
] };
export const deleteSyntax: CommandSyntax = { name: 'delete', defaultAction: '', actions: [
  { name: '', summary: 'preview deletion of a saved session and ask for confirmation', parameters: [{ name: 'id|prefix|title|last', kind: 'text', required: true }], flags: [] },
] };

export function runSessionManagementCommand(action: 'rename' | 'delete', args: string[]): CommandExecutionResult {
  const syntax = action === 'rename' ? renameSyntax : deleteSyntax;
  const parsed = parseSyntax(syntax, args);
  if (!parsed.ok) return { kind: 'local', output: `Invalid /${action} arguments: ${parsed.reason}\n${syntaxHelp(syntax)}` };
  return { kind: 'shell-action', action: 'manage-session', sessionOperation: action,
    ...(action === 'delete' ? { sessionId: parsed.args[0] } : parsed.args.length ? { sessionTitle: parsed.args.join(' ') } : {}) };
}
