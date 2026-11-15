import { providerCredentialBaseUrl, providerCredentialEndpoint } from '../../core/auth/account/target.js';
import { sessionVirtualModels } from '../../core/catalog/models.js';
import { setModel } from '../../core/commands/model/selection.js';
import { modelRequest } from '../../core/commands/model/target.js';
import { thinkingSyntax } from '../../core/commands/thinking/syntax.js';
import { catalogModel, catalogProvider } from '../../core/models/catalog.js';
import { effortCapability } from '../../core/models/capability.js';
import { THINKING_LEVELS } from '../../core/models/effort.js';
import { captureThinkingPreference } from '../../core/models/preference.js';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import { readLogicalModel } from '../../session/model/logical.js';
import { assertModelApplied, buildRpcCommandContext } from './runtimeOps.js';
import type { RpcThinkingLevels, RpcThinkingResult } from './protocol.js';
import { endpointShape } from '../../provider/endpoints/index.js';
import { effortOutputFailure } from '../../provider/endpoints/effort.js';
import { configuredOutputLimit } from '../../provider/request/output.js';

/** Available means locally selectable; undeclared legacy capability remains explicit uncertainty. */
export function rpcThinkingLevels(context: ShellRuntimeContext): RpcThinkingLevels {
  const logical = readLogicalModel(context.session.id);
  if (logical) {
    const model = sessionVirtualModels(context.cwd, context.session.id)
      .find(item => item.provider === logical.provider && item.id === logical.model);
    if (!model) throw new Error('The selected virtual model is unavailable. Reload its extension or choose another model.');
    return { levels: [...THINKING_LEVELS.filter(level => model.thinkingLevels?.includes(level) ?? true), 'off'], unverifiedLevels: [] };
  }
  const target = modelRequest(buildRpcCommandContext(context), context.runtimeConfig);
  const catalog = context.configuration.current.catalog;
  const baseUrl = providerCredentialBaseUrl(catalog, target);
  if (catalogProvider(catalog, target.provider, baseUrl).ambiguous) throw new Error('Multiple catalogue entries claim the selected endpoint.');
  const endpoint = providerCredentialEndpoint(catalog, target, baseUrl), shape = endpointShape(endpoint);
  const output = configuredOutputLimit(context.runtimeConfig, endpoint)
    ?? (shape.outputControl === 'provider' ? undefined : catalogModel(catalog, target.provider, target.model, baseUrl)?.maxTokens);
  if (effortOutputFailure(shape, output)) return { levels: ['off'], unverifiedLevels: [] };
  const available = THINKING_LEVELS.map(level => ({ level, capability: effortCapability(catalog, target.provider, target.model, level, baseUrl) }));
  return { levels: [...available.filter(item => item.capability !== 'unsupported').map(item => item.level), 'off'],
    unverifiedLevels: available.filter(item => item.capability === 'unverified').map(item => item.level) };
}

export async function setRpcThinking(context: ShellRuntimeContext, level: string): Promise<RpcThinkingResult> {
  const action = thinkingSyntax.actions.find(item => item.name === level || item.aliases?.includes(level));
  if (!action || action.effort === undefined) throw new Error(`Unknown thinking level '${level}'.`);
  const note = assertModelApplied(await setModel([], buildRpcCommandContext(context), false, action.effort));
  return { level: action.effort ?? 'auto', note };
}

export async function cycleRpcThinking(context: ShellRuntimeContext): Promise<RpcThinkingResult | null> {
  const { levels } = rpcThinkingLevels(context);
  if (levels.length < 2) return null;
  const logical = readLogicalModel(context.session.id);
  const current = (logical ? logical.thinkingEffort : captureThinkingPreference(context.projectRoot,
    modelRequest(buildRpcCommandContext(context), context.runtimeConfig).thinkingEffort).thinkingEffort) ?? 'off';
  return setRpcThinking(context, levels[(levels.indexOf(current) + 1) % levels.length]!);
}
