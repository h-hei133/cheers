import type { CommandDefinition } from '../types.js';
import { syntaxCompletions, syntaxHint } from '../syntax/projection.js';
import { advisorSyntax } from './syntax.js';

export function advisorCommandDefinition(): CommandDefinition {
  return { name: 'advisor', kind: 'prompt', supportsNonInteractive: true, availability: 'available', enabled: true, group: 'workflow',
    summary: 'configure and review an independent model at bounded checkpoints', argumentHint: syntaxHint(advisorSyntax),
    getArgumentCompletions: prefix => syntaxCompletions(advisorSyntax, prefix),
    execute: (args, context) => context.advisorCommand ? context.advisorCommand(args, context)
      : Promise.resolve({ kind: 'local', output: 'Advisor requires a bound session runtime.' }) };
}
