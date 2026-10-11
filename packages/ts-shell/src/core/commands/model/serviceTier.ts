import type { CommandContext, LocalCommandResult } from '../types.js';
import { loadCatalog } from '../../models/catalogStore.js';
import { serviceTierCapability } from '../../models/serviceTier.js';
import { readSessionModelEdit, writeSessionModel, type SessionModelEdit } from '../../../session/model/state.js';
import type { SessionModelSelection } from '../../../session/model/contract.js';
import { configurationApplicationNotice } from '../configuration.js';
import { parseSyntax } from '../syntax/parse.js';
import { syntaxHelp } from '../syntax/projection.js';
import { slowSyntax } from '../slow/syntax.js';
import { getRuntimeConfig } from '../../../config/runtimeConfig.js';
import { projectSessionModel } from '../../../session/model/projection.js';
import { resolveProviderCredential } from '../../shell/providerCredentials.js';
import { sameValue } from '../../../config/values.js';
import path from 'node:path';
import { connectionIdentity } from './identity.js';
import { catalogModel } from '../../models/catalog.js';

export function effectiveServiceTier(context: CommandContext): string | undefined {
  const config = context.readConfiguration?.().config ?? context.runtimeConfig
    ?? projectSessionModel(getRuntimeConfig(context.projectRoot ?? context.cwd), context.sessionId);
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
  const config = context.readConfiguration?.().config ?? context.runtimeConfig ?? projectSessionModel(getRuntimeConfig(root), context.sessionId);
  const catalog = context.readConfiguration?.().catalog ?? loadCatalog();
  if (config.activeProviderConnectionId !== selection.connectionId
    || config.providerConnections?.find(item => item.id === selection.connectionId)?.provider !== selection.provider) {
    return 'Service tier refused: the saved selection differs from the active connection. Select its connection and model again.';
  }
  if (context.admission?.() || baseline.projectRoot === undefined || path.resolve(baseline.projectRoot) !== path.resolve(root)) return 'Service tier refused: session or workspace admission changed.';
  if (serviceTierCapability(catalog, selection.provider, selection.model, tier) !== 'supported') {
    return `Service tier refused: ${selection.provider}/${selection.model} does not advertise ${tier}.`;
  }
  try {
    writeSessionModel(context.sessionId, withSessionServiceTier(selection, tier), baseline, () => {
      const loaded = getRuntimeConfig(root);
      return !context.admission?.() && loaded.configValidation.valid
        && sameValue(connectionIdentity(loaded.providerConnections.find(item => item.id === selection.connectionId)), connectionIdentity(config.providerConnections?.find(item => item.id === selection.connectionId)))
        && loaded.activeProviderConnectionId === selection.connectionId
        && sameValue(catalogModel(loadCatalog(), selection.provider, selection.model), catalogModel(catalog, selection.provider, selection.model))
        && serviceTierCapability(loadCatalog(), selection.provider, selection.model, tier) === 'supported';
    });
    const notice = configurationApplicationNotice(context);
    if (notice) return `Service tier preference saved as ${tier}. ${notice}`;
    const saved = projectSessionModel(getRuntimeConfig(root), context.sessionId);
    if (saved.providerConnections.find(item => item.id === selection.connectionId)?.serviceTier !== tier) return 'Service tier publication is unverified; inspect the effective model before sending.';
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
