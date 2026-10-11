export type ContextAttachmentAction =
  | { readonly name: 'files' }
  | { readonly name: 'add'; readonly path: string; readonly persistence: 'turn' | 'session' }
  | { readonly name: 'drop'; readonly path: string };

/** Parse only attachment management; it never grants write permission. */
export function parseContextAttachment(args: readonly string[]): ContextAttachmentAction | { readonly error: string } {
  const parsed = parseSyntax(contextSyntax, args.length ? args : ['files']);
  if (parsed.ok && parsed.action.name === 'files') return { name: 'files' };
  if (parsed.ok && parsed.action.name === 'add') return { name: 'add', path: parsed.args[0]!, persistence: parsed.flags.get('persist') === 'session' ? 'session' : 'turn' };
  if (parsed.ok && parsed.action.name === 'drop') return { name: 'drop', path: parsed.args[0]! };
  return { error: syntaxHelp(contextSyntax) };
}
import type { CommandSyntax } from '../../core/commands/syntax/model.js';
import { parseSyntax } from '../../core/commands/syntax/parse.js';
import { syntaxHelp } from '../../core/commands/syntax/projection.js';

export const contextSyntax: CommandSyntax = {
  name: 'context', defaultAction: 'status', actions: [
    { name: 'status', summary: 'show measured context usage', flags: [] },
    { name: 'files', summary: 'list explicitly attached files', flags: [] },
    { name: 'add', summary: 'attach a bounded authorized file', parameters: [{ name: 'path', kind: 'text', required: true }],
      flags: [{ name: 'persist', kind: 'text', values: ['turn', 'session'], summary: 'attachment lifetime' }] },
    { name: 'drop', summary: 'remove an attached file', parameters: [{ name: 'path', kind: 'text', required: true }], flags: [] },
  ],
};
