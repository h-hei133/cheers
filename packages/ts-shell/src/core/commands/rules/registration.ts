import { runRulesCommand } from '../rulesCommandRuntime.js';
import type { CommandDefinition } from '../types.js';
import { syntaxCompletions, syntaxHint } from '../syntax/projection.js';
import { rulesSyntax } from './syntax.js';

export function rulesCommandDefinition(): CommandDefinition {
  return { name: 'rules', kind: 'local', supportsNonInteractive: true, availability: 'available', enabled: true, group: 'workflow',
    summary: 'preview rule refinements from explicit feedback', argumentHint: syntaxHint(rulesSyntax),
    getArgumentCompletions: prefix => syntaxCompletions(rulesSyntax, prefix), execute: (args, context) => runRulesCommand(args, context) };
}
