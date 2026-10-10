import type { CommandDefinition } from '../types.js';
import { syntaxCompletions, syntaxHint } from '../syntax/projection.js';
import { collabSyntax, dumpSyntax, shareSyntax } from './syntax.js';
export function collaborationDefinitions(): CommandDefinition[] {
  return [collabSyntax, shareSyntax, dumpSyntax].map(syntax => ({ name: syntax.name, kind: 'local', supportsNonInteractive: true,
    enabled: true, availability: 'available', group: 'workflow', summary: syntax.name === 'collab' ? 'authenticated self-host session collaboration'
      : syntax.name === 'share' ? 'preview, approve and revoke read-only session shares' : 'preview, copy or save an explicit session projection',
    argumentHint: syntaxHint(syntax), getArgumentCompletions: prefix => syntaxCompletions(syntax, prefix),
    ...(syntax.name === 'collab' ? { invocations: [{ name: 'join', summary: 'observe one authenticated room', argumentHint: '<room>' },
      { name: 'leave', summary: 'release the guest connection' }] } : {}),
    execute: (args, context) => context.collaborationCommand ? context.collaborationCommand(syntax.name as 'collab' | 'share' | 'dump',
      context.rawCommandName === 'join' ? ['join', ...args] : context.rawCommandName === 'leave' ? ['leave', ...args] : args, context)
      : Promise.resolve({ kind: 'local', output: 'Collaboration requires a bound session runtime.' }) }));
}
