import { promptTokens, withoutPromptTokens, type PromptToken } from '../../prompts/tokens.js';
import { resolveCommandInvocation, type CommandInvocation } from '../invocation.js';
import type { CommandDefinition } from '../types.js';
import { tokenizeCommandArgs } from '../arguments.js';

export interface MethodInvocation {
  readonly token: PromptToken;
  readonly definition: CommandDefinition;
  readonly invocation: CommandInvocation;
  readonly args: readonly string[];
}

/** Parse source once. Only declared methods claim markers; arguments end at the next marker. */
export function compositionPlan(input: string, commands: readonly CommandDefinition[]) {
  const tokens = promptTokens(input);
  const methods: MethodInvocation[] = [];
  const removed: PromptToken[] = [];
  const skills: PromptToken[] = [];
  const disallowed: string[] = [];
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]!;
    if (token.literal) continue;
    if (/^\/skill:[^\s/\\]*$/.test(token.raw)) { skills.push(token); removed.push(token); continue; }
    if (!/^\/[A-Za-z0-9:._?-]+$/.test(token.raw)) continue;
    const invocation = resolveCommandInvocation(commands, token.raw);
    const definition = commands.find(command => command.name === invocation?.commandName);
    if (!invocation?.composition || !definition || definition.enabled === false || definition.availability === 'hidden') {
      if (invocation) disallowed.push(token.raw);
      continue;
    }
    removed.push(token);
    const args: string[] = [];
    const declaredFlags = invocation.composition.flags ?? [];
    while (declaredFlags.length > 0 && tokens[index + 1]?.raw.startsWith('-') && !tokens[index + 1]?.literal) {
      const option = tokens[++index]!; removed.push(option); args.push(option.raw);
      const [name] = option.raw.replace(/^--?/, '').split('=');
      const flag = declaredFlags.find(item => item.name === name || item.short === name || item.aliases?.includes(name!));
      const next = tokens[index + 1];
      const boundary = next && !next.literal && next.raw.startsWith('/') &&
        (next.raw.startsWith('/skill:') || resolveCommandInvocation(commands, next.raw));
      if (flag?.kind === 'text' && !option.raw.includes('=') && next && !boundary) {
        const value = tokens[++index]!; removed.push(value); args.push(tokenizeCommandArgs(value.raw)[0] ?? value.raw);
      }
    }
    if (invocation.composition.kind === 'driver' && tokens[index + 1] && !tokens[index + 1]!.literal &&
      invocation.composition.actions?.includes(tokens[index + 1]!.raw.toLowerCase())) {
      const action = tokens[++index]!; args.unshift(action.raw); removed.push(action);
    }
    methods.push({ token, invocation, definition, args });
  }
  return { methods, skills, prose: withoutPromptTokens(input, removed), tokens, disallowed };
}
