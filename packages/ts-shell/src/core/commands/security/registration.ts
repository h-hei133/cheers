import type { CommandDefinition } from '../types.js';
import { syntaxCompletions, syntaxHint } from '../syntax/projection.js';
import { securitySyntax } from './syntax.js';

export function securityCommandDefinition(): CommandDefinition {
  return { name: 'security', kind: 'local', supportsNonInteractive: true, availability: 'available', enabled: true, group: 'workflow',
    summary: 'analyze explicitly scoped files with an optional native analyzer, retain findings, and approve targeted repairs with native verification',
    argumentHint: syntaxHint(securitySyntax), getArgumentCompletions: prefix => syntaxCompletions(securitySyntax, prefix),
    execute: (args, context) => context.securityCommand ? context.securityCommand(args, context)
      : Promise.resolve({ kind: 'local', output: 'Security analysis requires a bound session runtime.' }) };
}
