import { thinkingSyntax } from './thinking/syntax.js';
import { parseSyntax } from './syntax/parse.js';
import { syntaxHelp } from './syntax/projection.js';
import { setModel } from './model/selection.js';
import { modelRequest } from './model/target.js';
import { captureThinkingPreference } from '../models/preference.js';
import { getRuntimeConfig } from '../../config/runtimeConfig.js';
import { projectSessionModel } from '../../session/model/projection.js';
import type { CommandContext, LocalCommandResult } from './types.js';

export async function runThinkingCommand(args: string[], context: CommandContext): Promise<LocalCommandResult> {
  const parsed = parseSyntax(thinkingSyntax, args);
  if (!parsed.ok) return { kind: 'local', output: `Invalid /thinking arguments: ${parsed.reason}\n${syntaxHelp(thinkingSyntax)}` };
  if (parsed.action.effort !== undefined) return { kind: 'local', output: await setModel([], context, parsed.flags.has('global'), parsed.action.effort) };
  if (parsed.flags.has('global')) return { kind: 'local', output: 'Choose an effort before --global.' };
  const effective = context.readConfiguration?.().config ?? context.runtimeConfig
    ?? projectSessionModel(getRuntimeConfig(context.projectRoot ?? context.cwd), context.sessionId);
  const request = modelRequest(context, effective);
  const current = captureThinkingPreference(context.projectRoot ?? context.cwd, request.thinkingEffort);
  return { kind: 'local', output: [
    `Thinking effort: ${current.thinkingEffort ?? 'auto (provider decides)'}.`,
    `Model: ${request.model ?? "not selected"}.`,
    current.thinkingEffortExplicit ? 'Using the accepted session or connection preference.' : 'Using the legacy project fallback; select a level to save it in this session.',
    'Explicit effort is preserved if the provider rejects it; choose auto to leave the decision to the provider.',
    syntaxHelp(thinkingSyntax),
  ].join('\n') };
}
