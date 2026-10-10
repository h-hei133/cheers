import type { CommandDefinition } from '../types.js';
import { syntaxCompletions, syntaxHint } from '../syntax/projection.js';
import { handoffSyntax } from './syntax.js';

export function handoffDefinition(): CommandDefinition {
  return { name: 'handover', kind: 'local', supportsNonInteractive: true, enabled: true, availability: 'available', group: 'workflow',
    summary: 'plan with the current model, then hand off one turn after an approved file change',
    argumentHint: syntaxHint(handoffSyntax), getArgumentCompletions: prefix => syntaxCompletions(handoffSyntax, prefix),
    execute: (args, context) => context.handoffCommand ? context.handoffCommand(args, context)
      : Promise.resolve({ kind: 'local', output: 'Model handoff requires a bound session runtime.' }) };
}
