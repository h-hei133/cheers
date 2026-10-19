import { providerCredentialEndpoint } from '../../auth/account/target.js';
import type { CommandContext, LocalCommandResult } from '../types.js';
import { loadCatalog } from '../../models/catalogStore.js';
import { serviceTierCapability } from '../../models/serviceTier.js';
import { readSessionModelEdit, writeSessionModel, type SessionModelEdit } from '../../../session/model/state.js';
import type { SessionModelSelection } from '../../../session/model/contract.js';
import { configurationApplicationNotice, readFreshConfiguration } from '../configuration.js';
import { parseSyntax } from '../syntax/parse.js';
import { syntaxHelp } from '../syntax/projection.js';
import { slowSyntax } from '../slow/syntax.js';
import { projectSessionModel } from '../../../session/model/projection.js';
import { resolveProviderCredential } from '../../shell/providerCredentials.js';
import { sameValue } from '../../../config/values.js';
import path from 'node:path';
import { connectionIdentity } from './identity.js';
import { catalogProvider } from '../../models/catalog.js';
import { selectedModelMatches, selectionRequest } from './target.js';

export function effectiveServiceTier(context: CommandContext): string | undefined {
  const config = context.readConfiguration?.().config ?? context.runtimeConfig
    ?? projectSessionModel(readFreshConfiguration(context), context.sessionId);
  const target = context.resolveConfigTarget?.(config) ?? resolveProviderCredential({ runtimeConfig: config });
  return config.providerConnections?.find(item => item.id === config.activeProviderConnectionId && item.provider === target.provider)?.serviceTier
    ?? config.providerCredentials?.[target.provider]?.serviceTier;
}

/** Apply or remove the session-only tier without leaving a stale value behind. */
export function withSessionServiceTier(selection: SessionModelSelection, tier: string | undefined): SessionModelSelection {
  const next = { ...selection };
  if (tier === undefined) delete next.serviceTier;
  else next.serviceTier = tier;
  return next;
}

/** Set a provider tier for the current session after catalog validation. */
export function setSessionServiceTier(context: CommandContext, tier: string): string {
  if (!context.sessionId) return 'Service tier requires an active session; no global preference was changed.';
  let baseline: SessionModelEdit;
  try { baseline = readSessionModelEdit(context.sessionId); }
  catch { return 'Service tier blocked: the saved model selection is unavailable.'; }
  const selection = baseline.selection;
  if (!selection) return 'Service tier requires a selected model in this session.';
  const root = context.projectRoot ?? context.cwd;
  const config = context.readConfiguration?.().config ?? context.runtimeConfig ?? projectSessionModel(readFreshConfiguration(context), context.sessionId);
  const catalog = context.readConfiguration?.().catalog ?? loadCatalog();
  if (!selectedModelMatches(config, selection)) {
    return 'Service tier refused: the saved selection differs from the active connection. Select its connection and model again.';
  }
  const request = selectionRequest(context, config, selection);
  if (request.provider !== selection.provider || request.model !== selection.model
    || (selection.connectionScope === 'provider' && (request.blocked || !request.credential))) {
    return 'Service tier refused: the selected model differs from the current request or its credential is unavailable.';
  }
  if (context.admission?.() || baseline.projectRoot === undefined || path.resolve(baseline.projectRoot) !== path.resolve(root)) return 'Service tier refused: session or workspace admission changed.';
  if (catalogProvider(catalog, selection.provider, request.baseUrl).ambiguous) return 'Service tier refused: multiple catalogue entries claim this endpoint.';
  if (serviceTierCapability(catalog, selection.provider, selection.model, tier, request.baseUrl, providerCredentialEndpoint(catalog, request, request.baseUrl)) !== 'supported') {
    return `Service tier refused: ${selection.provider}/${selection.model} does not advertise ${tier}.`;
  }
  try {
    writeSessionModel(context.sessionId, withSessionServiceTier(selection, tier), baseline, () => {
      const loaded = projectSessionModel(readFreshConfiguration(context), context.sessionId);
      return !context.admission?.() && loaded.configValidation.valid
        && sameValue(connectionIdentity(loaded.providerConnections.find(item => item.id === selection.connectionId)), connectionIdentity(config.providerConnections?.find(item => item.id === selection.connectionId)))
        && selectedModelMatches(loaded, selection) && sameValue(selectionRequest(context, loaded, selection), request)
        && sameValue(catalogProvider(loadCatalog(), selection.provider, request.baseUrl), catalogProvider(catalog, selection.provider, request.baseUrl))
        && serviceTierCapability(loadCatalog(), selection.provider, selection.model, tier, request.baseUrl, providerCredentialEndpoint(catalog, request, request.baseUrl)) === 'supported';
    });
    const notice = configurationApplicationNotice(context);
    if (notice) return `Service tier preference saved as ${tier}. ${notice}`;
    const saved = projectSessionModel(readFreshConfiguration(context), context.sessionId);
    const savedTier = selection.connectionScope === 'provider' ? saved.providerCredentials[saved.provider]?.serviceTier
      : saved.providerConnections.find(item => item.id === selection.connectionId)?.serviceTier;
    if (savedTier !== tier) return 'Service tier publication is unverified; inspect the effective model before sending.';
    return `Service tier set to ${tier} for this session. Account availability and pricing remain unverified.`;
  } catch { return 'Service tier write outcome is unverified; inspect the session before retrying.'; }
}

/** `/slow` uses the provider's flex tier when it is explicitly advertised. */
export async function runSlowCommand(args: string[], context: CommandContext): Promise<LocalCommandResult> {
  const parsed = parseSyntax(slowSyntax, args);
  if (!parsed.ok) return { kind: 'local', output: `Invalid /slow arguments: ${parsed.reason}\n${syntaxHelp(slowSyntax)}` };
  const action = parsed.action.name;
  const tier = effectiveServiceTier(context);
  if (!action || action === 'status') return { kind: 'local', output: `Slow mode: ${tier === 'flex' ? 'on (flex)' : `off (${tier ?? 'provider/project default; unverified'})`}.` };
  if (action === 'on' || action === 'enable') return { kind: 'local', output: setSessionServiceTier(context, 'flex') };
  if (action === 'off' || action === 'disable') return { kind: 'local', output: setSessionServiceTier(context, 'default') };
  return { kind: 'local', output: 'Usage: /slow [on|off|status]' };
}
