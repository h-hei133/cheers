import type { CommandContext, LocalCommandResult } from '../types.js';
import { catalogBaseUrl, catalogModel } from '../../models/catalog.js';
import { readSessionModel } from '../../../session/model/state.js';
import { parseSyntax } from '../syntax/parse.js';
import { syntaxHelp } from '../syntax/projection.js';
import { extendedContextSyntax } from '../extended-context/syntax.js';
import { publishModelPreference, PreferenceCapabilityError } from './preferences.js';

/** `/extended-context` exposes only the catalog's exact model window. */
export async function runExtendedContextCommand(args: string[], context: CommandContext): Promise<LocalCommandResult> {
  const parsed = parseSyntax(extendedContextSyntax, args);
  if (!parsed.ok) return { kind: 'local', output: `Invalid /extended-context arguments: ${parsed.reason}\n${syntaxHelp(extendedContextSyntax)}` };
  const selection = context.sessionId ? readSessionModel(context.sessionId) : undefined;
  const action = parsed.action.name;
  if (!action || action === 'status') return { kind: 'local', output: `Extended context: ${selection?.contextWindow ? `on (${selection.contextWindow} tokens)` : 'off'}.` };
  if (!selection || !context.sessionId) return { kind: 'local', output: 'Extended context requires an active selected model; no setting was changed.' };
  if (action === 'off' || action === 'disable') {
    const refusal = publishModelPreference(context, selected => { const next = { ...selected }; delete next.contextWindow; return next; });
    return { kind: 'local', output: refusal ?? 'Extended context disabled for this session.' };
  }
  if (action !== 'on' && action !== 'enable') return { kind: 'local', output: 'Usage: /extended-context [on|off|status]' };
  let window: number | undefined;
  const refusal = publishModelPreference(context, (selected, catalog, baseUrl) => {
    const supported = catalogModel(catalog, selected.provider, selected.model, catalogBaseUrl(catalog, selected.provider, baseUrl))?.contextWindow;
    if (!supported) throw new PreferenceCapabilityError('Extended context refused: this exact model has no published window.');
    window = supported;
    return { ...selected, contextWindow: supported };
  });
  return { kind: 'local', output: refusal ?? `Extended context enabled at the catalog window (${window} tokens) for this session.` };
}
