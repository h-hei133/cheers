import type { CommandSyntax } from '../syntax/model.js';
import type { CommandDefinition } from '../types.js';
import { syntaxCompletions, syntaxHint } from '../syntax/projection.js';
import { parseSyntax } from '../syntax/parse.js';
import { parseNavigationArgs } from './syntax.js';

export type SessionCommandName = 'pin' | 'history' | 'import' | 'open' | 'shake';
const path = { name: 'path', kind: 'text', required: true } as const;
const mode = { name: 'mode', kind: 'text', values: ['elide', 'images', 'thinking'] } as const;
export const sessionSyntax: Readonly<Record<SessionCommandName, CommandSyntax>> = {
  pin: { name: 'pin', defaultAction: '', actions: [{ name: '', summary: 'pin or unpin a saved session', parameters: [
    { name: 'session-id|here', kind: 'text' }, { name: 'on|off', kind: 'text', values: ['on', 'off'] },
  ], flags: [] }] },
  history: { name: 'history', defaultAction: 'list', actions: [
    { name: 'list', summary: 'show the complete saved conversation tree', flags: [] },
    { name: 'export', summary: 'export a sanitized versioned history after write approval', parameters: [path], flags: [] },
  ] },
  import: { name: 'import', defaultAction: '', actions: [{ name: '', summary: 'import versioned history into a new inactive session', parameters: [path], flags: [] }] },
  open: { name: 'open', defaultAction: '', actions: [
    { name: '', summary: 'open the latest or a selected conversation link after approval', parameters: [{ name: 'link-number', kind: 'integer', minimum: 1 }], flags: [] },
    { name: 'list', summary: 'list actual links in the conversation', flags: [] },
  ] },
  shake: { name: 'shake', defaultAction: 'preview', actions: [
    { name: 'preview', summary: 'preview heavy content that can be omitted from model context', parameters: [mode], flags: [] },
    { name: 'apply', summary: 'omit selected heavy content while retaining original history', parameters: [mode], flags: [] },
    { name: 'status', summary: 'show current context selections', flags: [] },
    { name: 'restore', summary: 'restore original content to model context', flags: [] },
  ] },
};

export function sessionCommandDefinitions(): CommandDefinition[] {
  return (Object.keys(sessionSyntax) as SessionCommandName[]).map(name => ({ name, kind: 'local', supportsNonInteractive: true,
    availability: 'available', enabled: true, group: 'session', summary: sessionSyntax[name].actions[0]!.summary,
    argumentHint: syntaxHint(sessionSyntax[name]), getArgumentCompletions: prefix => syntaxCompletions(sessionSyntax[name], prefix),
    execute: (args, context) => runSessionCommand(name, args, context),
  }));
}

export async function runSessionCommand(name: SessionCommandName, args: string[], context: import('../types.js').CommandContext) {
  const parsed = parseSessionArgs(name, args);
  if (!parsed.ok) return { kind: 'local' as const, output: `Invalid /${name} arguments: ${parsed.reason}` };
  return context.sessionCommand ? context.sessionCommand(name, args, context)
    : { kind: 'local' as const, output: 'This operation requires a bound session runtime.' };
}

export function parseSessionArgs(name: SessionCommandName, args: readonly string[]) {
  return name === 'open' ? parseNavigationArgs(sessionSyntax[name], args) : parseSyntax(sessionSyntax[name], args);
}
