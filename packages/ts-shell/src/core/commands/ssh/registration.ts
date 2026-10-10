import type { CommandDefinition } from '../types.js';
import { syntaxHint, syntaxCompletions } from '../syntax/projection.js';
import { sshSyntax } from './syntax.js';

export function sshCommandDefinition(): CommandDefinition {
  return { name: 'ssh', kind: 'local', supportsNonInteractive: true, availability: 'available', enabled: true,
    summary: 'connect to a verified remote workspace and manage durable jobs', group: 'workflow',
    argumentHint: syntaxHint(sshSyntax), getArgumentCompletions: prefix => syntaxCompletions(sshSyntax, prefix),
    execute: (args, context) => context.sshCommand ? context.sshCommand(args, context)
      : Promise.resolve({ kind: 'local', output: 'SSH requires a bound session runtime.' }) };
}
