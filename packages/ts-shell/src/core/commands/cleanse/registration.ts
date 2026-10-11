import { runCleanseCommand } from '../cleanseCommandRuntime.js';
import type { CommandDefinition } from '../types.js';
import { syntaxCompletions, syntaxHint } from '../syntax/projection.js';
import { cleanseSyntax } from './syntax.js';

export function cleanseCommandDefinition(): CommandDefinition {
  return { name: 'cleanse', kind: 'local', supportsNonInteractive: true, availability: 'available', enabled: true, group: 'workflow',
    summary: 'diagnose, repair, and verify a bounded issue with retained evidence', argumentHint: syntaxHint(cleanseSyntax),
    getArgumentCompletions: prefix => syntaxCompletions(cleanseSyntax, prefix), execute: (args, context) => runCleanseCommand(args, context) };
}
