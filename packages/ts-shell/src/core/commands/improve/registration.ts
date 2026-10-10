import type { CommandDefinition } from '../types.js';
import { syntaxCompletions, syntaxHint } from '../syntax/projection.js';
import { improveSyntax } from './syntax.js';
export function improveDefinition(): CommandDefinition {
  return { name: 'improve', kind: 'local', supportsNonInteractive: true, enabled: true, availability: 'available', group: 'workflow',
    summary: 'iterate on isolated candidates with a fixed evaluator and holdout set', argumentHint: syntaxHint(improveSyntax),
    getArgumentCompletions: prefix => syntaxCompletions(improveSyntax, prefix),
    execute: (args, context) => context.improveCommand ? context.improveCommand(args, context)
      : Promise.resolve({ kind: 'local', output: 'Evaluation requires the current bound session runtime.' }) };
}
