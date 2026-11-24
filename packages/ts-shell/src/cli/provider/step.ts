import type { RuntimeConfig } from '../../config/runtimeConfig.js';
import type { ProviderCredentialResolution } from '../../core/shell/providerCredentials.js';
import type { CatalogProvider } from '../../core/models/catalog.js';
import type { RequestPolicy } from '../../core/agent/request/model.js';
import type { ThinkingPreference } from '../../core/models/effort.js';
import type { ToolDefinition } from '../../tools/types.js';
import { buildSystemPrompt, systemPromptSnapshot, type SystemPromptContext } from '../../turn/prompt.js';
import { createStepFunction, type StepFunction, type StepRequest } from '../../turn/step.js';
import { loadCatalog } from '../../core/models/catalogStore.js';
import { catalogProvider } from '../../core/models/catalog.js';
import { providerModelTransport } from '../../provider/request/transport.js';
import { providerFetchForEndpoint } from '../../provider/request/fetch.js';
import { endpointShape } from '../../provider/endpoints/index.js';
import { toolSchemas } from '../../turn/tools.js';
import { delegatedTarget } from './target.js';
import { requestServiceTier } from '../../core/models/serviceTier.js';
import { assertScopedModel, scopedRuntimeConfig } from '../../config/scope/projection.js';
import { credentialBlockMessage } from '../../core/shell/providerCredentials.js';
import type { ToolDiscovery } from '../../core/tools/discovery/state.js';
import { scopeAdmission } from '../../config/scope/admission.js';
import { mergeConfigValue } from '../../config/merge.js';
import type { SessionModelRole } from '../../session/model/contract.js';
import { assertAdmission } from '../../core/network/admission.js';
import { delegatedRenewal, type AccountRotation, type AccountPublication } from './renewal.js';
import { sessionUsageSink } from '../../session/store/usage.js';
import { resolveRequestShape } from '../../core/models/requestShape.js';
import { providerCredentialBaseUrl, providerCredentialEndpoint } from '../../core/auth/account/target.js';
import { configuredOutputLimit } from '../../provider/request/output.js';
import { providerRequestTarget } from './requestTarget.js';
import { configuredContextWindow } from '../../core/models/window.js';
import type { VirtualModelRegistry } from '../../core/models/virtualModels.js';
import { providerRouteResolver } from './route.js';
import type { SessionVirtualModelSelection } from '../../session/model/contract.js';
import { captureRoutingState } from '../../session/model/routing.js';
import { createAccountTurnAffinity } from '../../provider/endpoints/responses/account.js';
import { providerTimeoutsFrom, resolveProviderTransportConfig } from '../../provider/request/fetch.js';

export interface ProviderStepHost {
  readonly providerMode: 'synthetic' | 'real';
  readonly providerCredentialResolution: ProviderCredentialResolution;
  readonly runtimeConfig?: RuntimeConfig;
  readonly providerCatalog?: readonly CatalogProvider[];
  readonly agentMode: 'plan' | 'build';
  readonly workspaceRoot: string;
  readonly sessionId: string;
  readonly requestPolicy?: RequestPolicy;
  readonly admission?: () => string | undefined;
  readonly thinkingEffort?: ThinkingPreference;
  readonly thinkingEffortExplicit?: boolean;
  readonly serviceTier?: string;
  readonly onCredentialPersisted?: (rotation?: AccountRotation) => boolean | void;
  readonly cacheRetention?: 'short' | 'long' | 'none';
  readonly virtualModels?: VirtualModelRegistry;
  readonly virtualModel?: SessionVirtualModelSelection;
}

/** The same captured catalogue address and model used by the request adapter. */
export function providerToolsAvailable(request: Pick<ProviderStepHost,
  'providerMode' | 'providerCredentialResolution' | 'providerCatalog' | 'virtualModel'>, catalog?: readonly CatalogProvider[]): boolean {
  if (request.virtualModel) return true;
  if (request.providerMode === 'synthetic') return true;
  const accepted = catalog ?? request.providerCatalog ?? loadCatalog();
  const resolution = request.providerCredentialResolution;
  const address = providerCredentialBaseUrl(accepted, resolution);
  return resolveRequestShape(accepted, resolution.provider, resolution.model ?? resolution.credential?.model,
    undefined, address ?? undefined).toolCalling;
}

export function createProviderStep(
  request: ProviderStepHost,
  tools: ReadonlyMap<string, ToolDefinition>,
  promptContext: SystemPromptContext,
  discovery?: ToolDiscovery,
): StepFunction {
  return createStepFunction({ ...providerStepRequest(request, tools, promptContext, discovery),
    accountTurnAffinity: createAccountTurnAffinity() });
}

/** Shared request assembly for foreground dispatch and pure context preparation. */
export function providerStepRequest(
  request: ProviderStepHost,
  tools: ReadonlyMap<string, ToolDefinition>,
  promptContext: SystemPromptContext,
  discovery?: ToolDiscovery,
): StepRequest {
  const resolution = request.providerCredentialResolution;
  const logical = request.virtualModel;
  if (!logical) {
    assertScopedModel(request.runtimeConfig, resolution);
    if (resolution.blocked) throw new Error(credentialBlockMessage(resolution.blocked));
  }
  // Read once for the whole step function, not once per use: loading the
  // catalogue touches the filesystem, and a run that reloaded it mid-turn could
  // change request shape between two steps of the same answer.
  const catalog = request.providerCatalog ?? loadCatalog();
  const baseUrl = logical ? undefined : providerCredentialBaseUrl(catalog, resolution);
  if (!logical && catalogProvider(catalog, resolution.provider, baseUrl).ambiguous) throw new Error('The model catalogue has multiple entries for this endpoint. Resolve them before sending.');
  const endpoint = logical ? undefined : providerCredentialEndpoint(catalog, resolution, baseUrl);
  const configuredTier = logical ? undefined : requestServiceTier(request.runtimeConfig, resolution, catalog, baseUrl, endpoint, request.serviceTier);
  const contextWindow = logical ? undefined : configuredContextWindow(request.runtimeConfig, resolution);
  const system = systemPromptSnapshot(request.agentMode, promptContext, providerToolsAvailable(request, catalog));
  const targetIdentity = logical ? undefined : providerRequestTarget({
    workspaceRoot: request.workspaceRoot,
    sessionId: request.sessionId,
    resolution,
    baseUrl: baseUrl ?? "",
    ...(endpoint ? { endpoint } : {}),
  });
  return {
    recordAuxiliaryUsage: sessionUsageSink(request.sessionId),
    bodyIdleTimeoutMs: resolveProviderTransportConfig(process.env, providerTimeoutsFrom(request.runtimeConfig)).bodyTimeoutMs,
    requestPolicy: request.requestPolicy,
    modelTransport: logical ? undefined : providerModelTransport(request.runtimeConfig, endpoint, request.admission),
    ...(logical ? {} : { transportOwnsBodyDeadline: true as const }),
    provider: {
      // Built from the whole credential, not from its key alone. An account login
      // yields a token instead of a key, and formatting the header here from a
      // field it does not have is what sent an empty bearer.
      headers: targetIdentity?.headers ?? {},
      baseUrl: baseUrl ?? "",
      ...(targetIdentity?.replayOwner ? { replayOwner: targetIdentity.replayOwner } : {}),
      replayBinding: targetIdentity?.replayBinding,
      model: resolution.model ?? resolution.credential?.model ?? "",
      // The catalog is keyed by provider id, so the request shape cannot be
      // resolved without it.
      provider: resolution.provider,
      // Which endpoint kind this provider is reached through. Read from the
      // catalog rather than inferred from the provider id: the id names who
      // answers, and an endpoint is how they want to be asked.
      ...(endpoint ? { endpoint } : {}),
      ...(configuredTier ? { serviceTier: configuredTier } : {}),
      ...(targetIdentity?.credentialId && targetIdentity.credentialGeneration
        ? { credentialId: targetIdentity.credentialId, credentialGeneration: targetIdentity.credentialGeneration }
        : {}),
    },
    // Without this the request is sent with the global fetch, which has no
    // deadline: a provider that accepts the connection and then never answers
    // leaves the turn waiting forever, and the retry layer cannot rescue it
    // because it classifies a failure only after a response arrives.
    // The endpoint decides how its requests are authenticated, and for two of
    // them that is not a constant header: one signs, one carries a token that
    // expires. Both are applied by the transport, which is the only place a
    // request exists whole.
    fetchImpl: logical ? undefined : providerFetchForEndpoint(request.runtimeConfig, endpoint, endpointShape, request.admission),
    workspaceRoot: request.workspaceRoot,
    sessionId: request.sessionId,
    systemPrompt: system.text,
    systemPromptSources: system.sources,
    systemPromptFor: (agentMode, _toolNames, toolsAvailable = true) =>
      buildSystemPrompt(agentMode ?? request.agentMode, promptContext, toolsAvailable),
    thinkingEffort: logical ? logical.thinkingEffort : request.thinkingEffort,
    thinkingEffortExplicit: logical ? logical.thinkingEffort !== undefined : request.thinkingEffortExplicit,
    tools: toolSchemas(tools),
    ...(discovery ? { toolSnapshot: () => toolSchemas(discovery.snapshot()) } : {}),
    initialTools: toolSchemas(tools),
    cacheRetention: request.cacheRetention ?? request.runtimeConfig?.cacheRetention ?? 'short',
    ...(logical ? { virtualModel: { provider: logical.provider, modelId: logical.model },
      captureRouteState: (provider: string, modelId: string, admission: () => void) => captureRoutingState({
        sessionId: request.sessionId, cwd: request.workspaceRoot, provider, modelId,
        admission: () => { assertAdmission(request.admission); admission(); } }),
    } : {}),
    ...(request.virtualModels ? { virtualModels: request.virtualModels,
      resolveTarget: providerRouteResolver({ ...request, providerCatalog: catalog, virtualModels: request.virtualModels },
        (target, admission) => providerStepRequest({ ...request, providerCatalog: catalog,
          providerCredentialResolution: target, admission, virtualModels: undefined, virtualModel: undefined }, tools, promptContext, discovery)),
    } : {}),
    catalog,
    // Sampling settings travel with the request, not with the provider: a
    // provider that ignores them still receives a well-formed request, and a
    // run that sets none keeps the step's own defaults.
    temperature: request.runtimeConfig?.temperature,
    topP: request.runtimeConfig?.topP,
    maxOutputTokens: logical ? undefined : configuredOutputLimit(request.runtimeConfig, endpoint),
    ...(contextWindow !== undefined ? { contextWindow } : {}),
    ...(request.runtimeConfig?.reserveTokens !== undefined ? { reserveTokens: request.runtimeConfig.reserveTokens } : {}),
    pruneToolText: request.runtimeConfig?.pruneToolText,
    retry: {
      enabled: request.runtimeConfig?.retryEnabled,
      maxRetries: request.runtimeConfig?.providerRetryMaxRetries,
      baseDelayMs: request.runtimeConfig?.retryBaseDelayMs,
      maxDelayMs: request.runtimeConfig?.retryMaxDelayMs,
    },
  };
}

/** Each explicit delegated model is resolved once; unavailable targets never use the main step. */
export function delegatedSteps(request: ProviderStepHost, tools: ReadonlyMap<string, ToolDefinition>, context: SystemPromptContext,
  syntheticDefault?: StepFunction, discovery?: ToolDiscovery) {
  const renew = delegatedRenewal(request);
  const catalog = request.providerCatalog ?? loadCatalog();
  const select = (model: string | SessionModelRole, admission?: () => string | undefined, effort?: ThinkingPreference, providerScope?: 'current', workspace = request.workspaceRoot) => {
    if (request.providerMode === 'synthetic') {
      if (!model && effort === undefined && syntheticDefault) return { step: syntheticDefault, prepare: async () => {}, acceptsTools: true };
      throw new Error('Independent model review is unavailable in synthetic provider mode.');
    }
    const main = request.providerCredentialResolution;
    const scoped = request.runtimeConfig ? scopedRuntimeConfig(request.runtimeConfig, workspace) : undefined;
    const runtimeConfig = scoped && request.runtimeConfig?.allowedModels !== undefined ? { ...scoped,
      allowedModels: mergeConfigValue(request.runtimeConfig.allowedModels, scoped.allowedModels ?? request.runtimeConfig.allowedModels, 'intersect') as readonly string[] } : scoped;
    const resolution = model ? providerScope === 'current' && typeof model === 'string'
      ? delegatedTarget(`${main.provider}/${model}`, main, runtimeConfig, catalog, 'current')
      : delegatedTarget(model, main, runtimeConfig, catalog) : main;
    const scopedAdmission = scopeAdmission(runtimeConfig?.configScopes, workspace);
    const admit = () => request.admission?.() ?? admission?.() ?? scopedAdmission();
    assertAdmission(admit);
    const requestPolicy = request.requestPolicy?.withAdmission?.(() => { const refusal = admit(); if (refusal) throw new Error(refusal); }) ?? request.requestPolicy;
    const virtualModel = model ? undefined : request.virtualModel && { ...request.virtualModel,
      ...(effort !== undefined ? { thinkingEffort: effort } : {}) };
    const selected = { ...request, providerCatalog: catalog, runtimeConfig, workspaceRoot: workspace, providerCredentialResolution: resolution,
      virtualModel, virtualModels: model ? undefined : request.virtualModels,
      requestPolicy, admission: admit, ...(effort !== undefined ? { thinkingEffort: effort, thinkingEffortExplicit: true } : {}) };
    // Validate the captured request before any refresh side effect. Building a step does not send.
    let active = createProviderStep(selected, tools, context, discovery);
    let credential = resolution.credential?.accountAuth;
    const prepare = async (publication?: AccountPublication) => {
      if (virtualModel) { assertAdmission(admit); return; }
      const fresh = await renew(resolution, admit, publication);
      if (fresh.credential?.accountAuth !== credential) {
        active = createProviderStep({ ...selected, providerCredentialResolution: fresh }, tools, context, discovery);
        credential = fresh.credential?.accountAuth;
      }
    };
    const step: StepFunction = Object.assign(async (...args: Parameters<StepFunction>) => {
      args[1]?.throwIfAborted(); await prepare(); args[1]?.throwIfAborted(); return active(...args);
    }, { preparesContext: true as const });
    // The same catalogue address the step itself resolves, so a delegated
    // instruction cannot claim tools the target model is declared not to take.
    const acceptsTools = providerToolsAvailable(selected, catalog);
    return { step, prepare, acceptsTools };
  };
  return Object.assign((...args: Parameters<typeof select>): StepFunction => select(...args).step,
    { prepare: async (model: string | SessionModelRole, admission?: () => string | undefined, effort?: ThinkingPreference,
      workspace?: string, publication?: AccountPublication): Promise<void> => { await select(model, admission, effort, undefined, workspace).prepare(publication); },
      acceptsTools: (model: string | SessionModelRole | undefined): boolean => select(model ?? '').acceptsTools });
}
