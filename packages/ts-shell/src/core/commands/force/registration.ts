import { runForceCommand } from '../forceCommandRuntime.js';
import type { CommandDefinition } from '../types.js';
import { syntaxCompletions, syntaxHint } from '../syntax/projection.js';
import { forceSyntax } from './syntax.js';

export function forceCommandDefinition(): CommandDefinition {
  return { name: 'force', aliases: ['force:'], kind: 'local', supportsNonInteractive: true, availability: 'available', enabled: true, group: 'workflow',
    summary: 'select one already available tool for the next request', argumentHint: syntaxHint(forceSyntax),
    getArgumentCompletions: prefix => syntaxCompletions(forceSyntax, prefix), execute: (args, context) => runForceCommand(args, context) };
}
