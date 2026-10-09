import type { CommandDefinition } from '../types.js';
import { syntaxHint, syntaxCompletions } from '../syntax/projection.js';
import { agentsSyntax } from './syntax.js';
export function agentsCommandDefinition(): CommandDefinition {
  return { name: 'agents', kind: 'local', supportsNonInteractive: true, availability: 'available', enabled: true, group: 'workflow',
    summary: 'discover and approve user or project agent definitions, tools, model and effort', argumentHint: syntaxHint(agentsSyntax),
    getArgumentCompletions: prefix => syntaxCompletions(agentsSyntax, prefix), execute: (args, context) => context.agentsCommand
      ? context.agentsCommand(args, context) : Promise.resolve({ kind: 'local', output: 'Agent management requires a bound session runtime.' }) };
}
