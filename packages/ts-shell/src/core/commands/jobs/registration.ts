import type { CommandDefinition } from '../types.js';
import { syntaxHint, syntaxCompletions } from '../syntax/projection.js';
import { jobsSyntax } from './syntax.js';

export function jobsDefinitions(): CommandDefinition[] {
  return [{ name: 'jobs', kind: 'local', supportsNonInteractive: true, enabled: true, availability: 'available', group: 'workflow',
    argumentMode: 'raw',
    summary: 'inspect and control real session-owned background work', argumentHint: syntaxHint(jobsSyntax),
    getArgumentCompletions: prefix => syntaxCompletions(jobsSyntax, prefix),
    execute: (args, context) => context.jobsCommand ? context.jobsCommand('jobs', args, context)
      : Promise.resolve({ kind: 'local', output: 'Jobs require a bound session runtime.' }) },
  { name: 'hub', kind: 'local', supportsNonInteractive: true, enabled: true, availability: 'available', group: 'workflow',
    summary: 'show actual session jobs, parents and shared request usage',
    execute: (args, context) => context.jobsCommand ? context.jobsCommand('hub', args, context)
      : Promise.resolve({ kind: 'local', output: 'Jobs require a bound session runtime.' }) }];
}
