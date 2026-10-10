import type { CommandDefinition } from '../types.js';
import { syntaxCompletions, syntaxHint } from '../syntax/projection.js';
import { liveSyntax } from '../live/syntax.js';
import { recordSyntax } from '../record/syntax.js';
export function mediaDefinitions(): CommandDefinition[] {
  return [liveSyntax, recordSyntax].map(syntax => ({ name: syntax.name, kind: 'local', supportsNonInteractive: true,
    enabled: true, availability: 'available', group: 'workflow', summary: syntax.name === 'live' ? 'explicit bounded voice capture and playback' : 'record actual terminal output locally and replay safe text',
    argumentHint: syntaxHint(syntax), getArgumentCompletions: prefix => syntaxCompletions(syntax, prefix),
    execute: (args, context) => context.mediaCommand ? context.mediaCommand(syntax.name as 'live' | 'record', args, context)
      : Promise.resolve({ kind: 'local', output: 'Media requires the current bound terminal session.' }) }));
}
