import type { CommandDefinition } from '../types.js';
import { syntaxCompletions, syntaxHint } from '../syntax/projection.js';
import { directorSyntax } from './syntax.js';

export function directorDefinition(): CommandDefinition {
  return { name: 'director', kind: 'local', argumentMode: 'raw', supportsNonInteractive: true, enabled: true, availability: 'available', group: 'workflow',
    summary: 'coordinate persistent workers through ordinary approvals and a shared budget',
    argumentHint: syntaxHint(directorSyntax), getArgumentCompletions: prefix => syntaxCompletions(directorSyntax, prefix),
    execute: (args, context) => context.directorCommand ? context.directorCommand(args, context)
      : Promise.resolve({ kind: 'local', output: 'Director requires a bound session runtime.' }) };
}
