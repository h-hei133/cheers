import type { CommandDefinition } from '../commands/types.js';
import { expandTemplate, parseArguments, substituteArguments } from './expansion.js';
import { TemplateLoader } from './templateLoader.js';

/** The discovered template owner supplies the same capabilities to menu and dispatcher. */
export function templateCommands(cwd: string, onSource?: (target: string) => void): CommandDefinition[] {
  return [...new TemplateLoader(cwd, onSource).load().values()].map(template => ({
    name: template.name, kind: 'prompt', supportsNonInteractive: true, group: 'workflow', argumentMode: 'raw',
    summary: template.description || 'apply a prompt template', argumentHint: template.argumentHint,
    ...(template.composable ? { composition: { kind: 'modifier' as const, prepare: (_args: readonly string[], prose: string) => ({
      instruction: substituteArguments(template.content, parseArguments(prose)),
    }) } } : {}),
    execute: async (_args, context) => ({ kind: 'prompt' as const,
      prompt: expandTemplate(`/${template.name} ${context.rawCommandArgs ?? ''}`, new Map([[template.name, template]])).text,
      notice: `Expanded template ${template.name} into a prompt.` }),
  }));
}
