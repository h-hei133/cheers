import { fastSyntax } from './fast/syntax.js';
import { syntaxHelp } from './syntax/projection.js';
import { parseSyntax } from './syntax/parse.js';
import type { CommandContext, LocalCommandResult } from './types.js';
import { readProjectState } from '../state/projectState.js';
import { effectiveServiceTier, setSessionServiceTier } from './model/serviceTier.js';

/** Fast is a provider service tier. The old project sampling flag is retained as legacy data only. */
export async function runFastCommand(args: string[], context: CommandContext): Promise<LocalCommandResult> {
  const parsed = parseSyntax(fastSyntax, args);
  if (!parsed.ok) return { kind: 'local', output: `Invalid /fast arguments: ${parsed.reason}\n${syntaxHelp(fastSyntax)}` };
  const current = effectiveServiceTier(context);
  const enabled = current === 'priority' || current === 'fast';
  const action = parsed.action.name;
  const legacy = readProjectState(context.projectRoot ?? context.cwd).fastSampling === true
    ? 'Legacy fastSampling is retained but no longer changes temperature. Select temperature in settings and opt into a supported tier explicitly.' : undefined;
  const tier = action === 'on' ? 'priority' : action === 'off' ? 'default' : action === 'toggle' ? enabled ? 'default' : 'priority' : undefined;
  const output = tier === undefined ? `Fast mode: ${enabled ? 'on' : 'off'}; effective service tier: ${current ?? 'provider/project default (unverified)'}. Account availability and pricing remain unverified.`
    : setSessionServiceTier(context, tier);
  return { kind: 'local', output: [output, legacy].filter(Boolean).join('\n') };
}
