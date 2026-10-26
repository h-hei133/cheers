import type { CommandDefinition } from '../commands/types.js';
import { expandTemplate, parseArguments, substituteArguments } from './expansion.js';
import { TemplateLoader, type TemplateLoadOptions } from './templateLoader.js';

/** The discovered template owner supplies the same capabilities to menu and dispatcher. */
export function templateCommands(cwd: string, onSource?: (target: string, content?: Buffer) => void,
  options?: TemplateLoadOptions): CommandDefinition[] {
  return [...new TemplateLoader(cwd, onSource, options).load().values()].map((template): CommandDefinition => {
    const preparePrompt = (rawArgs: string) => expandTemplate(`/${template.name} ${rawArgs}`, new Map([[template.name, template]])).text;
    return {
      name: template.name, kind: 'prompt', supportsNonInteractive: true, group: 'workflow', argumentMode: 'raw',
      summary: template.description || 'apply a prompt template', argumentHint: template.argumentHint,
      preparePrompt,
      ...(template.composable ? { composition: { kind: 'modifier' as const, prepare: (_args: readonly string[], prose: string) => ({
        instruction: substituteArguments(template.content, parseArguments(prose)),
      }) } } : {}),
      execute: async (_args, context) => ({ kind: 'prompt' as const,
        prompt: preparePrompt(context.rawCommandArgs ?? ''),
        notice: `Expanded template ${template.name} into a prompt.` }),
    };
  });
}
