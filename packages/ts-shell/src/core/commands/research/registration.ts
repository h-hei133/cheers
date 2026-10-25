import type { CommandDefinition } from '../types.js';
import { researchAliases, researchSyntax, prepareResearch } from './syntax.js';
import { syntaxCompletions, syntaxHint } from '../syntax/projection.js';

export function researchCommandDefinition(): CommandDefinition {
  return { name: 'deep-research', aliases: [...researchAliases], kind: 'prompt', supportsNonInteractive: true,
    composition: { kind: 'driver', flags: researchSyntax.flags, actions: researchSyntax.actions.map(action => action.name).filter(Boolean), prepare: prepareResearch },
    availability: 'available', enabled: true, group: 'workflow',
    summary: 'research software and papers with durable evidence, gaps, adversarial review and a separate approved report save',
    argumentHint: syntaxHint(researchSyntax), getArgumentCompletions: prefix => syntaxCompletions(researchSyntax, prefix),
    execute: (args, context) => context.researchCommand ? context.researchCommand(args, context)
      : Promise.resolve({ kind: 'local', output: 'Deep research requires a bound session runtime.' }) };
}
