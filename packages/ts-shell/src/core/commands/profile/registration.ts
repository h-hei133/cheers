import { runProfileCommand } from '../../../config/profiles/command.js';
import type { CommandDefinition } from '../types.js';
import { syntaxCompletions, syntaxHint } from '../syntax/projection.js';
import { profileSyntax } from './syntax.js';

export function profileDefinition(): CommandDefinition {
  return { name: 'profile', kind: 'local', supportsNonInteractive: true, availability: 'available', enabled: true, group: 'session',
    summary: 'manage isolated profiles and explicit data imports', argumentHint: syntaxHint(profileSyntax),
    getArgumentCompletions: prefix => syntaxCompletions(profileSyntax, prefix), execute: runProfileCommand };
}
