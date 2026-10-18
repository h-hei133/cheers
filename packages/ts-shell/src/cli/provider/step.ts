import type { RuntimeConfig } from '../../config/runtimeConfig.js';
import type { ProviderCredentialResolution } from '../../core/shell/providerCredentials.js';
import type { CatalogProvider } from '../../core/models/catalog.js';
import type { RequestPolicy } from '../../core/agent/request/model.js';
import type { ThinkingPreference } from '../../core/models/effort.js';
import type { ToolDefinition } from '../../tools/types.js';
import { buildSystemPrompt, systemPromptSnapshot, type SystemPromptContext } from '../../turn/prompt.js';
import { createStepFunction, type StepFunction } from '../../turn/step.js';
import { loadCatalog } from '../../core/models/catalogStore.js';
import { catalogBaseUrl, catalogProvider, providerEndpoint } from '../../core/models/catalog.js';
import { accountAuthFor, providerAuthorization } from '../../provider/request/authorization.js';
import { providerModelTransport } from '../../provider/request/transport.js';
import { providerFetchForEndpoint } from '../../provider/request/fetch.js';
import { endpointShape } from '../../provider/endpoints/index.js';
import { toolSchemas } from '../../turn/tools.js';
import { delegatedTarget } from './target.js';
import { serviceTierCapability } from '../../core/models/serviceTier.js';
import { assertScopedModel, scopedRuntimeConfig } from '../../config/scope/projection.js';
import { credentialBlockMessage } from '../../core/shell/providerCredentials.js';
import { credentialIdentityFor } from '../../core/auth/account/pool.js';
import type { ToolDiscovery } from '../../core/tools/discovery/state.js';
import { scopeAdmission } from '../../config/scope/admission.js';
import { mergeConfigValue } from '../../config/merge.js';
import type { SessionModelRole } from '../../session/model/contract.js';
import { assertAdmission } from '../../core/network/admission.js';
import { delegatedRenewal, type AccountRotation, type AccountPublication } from './renewal.js';

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
}

export function createProviderStep(
  request: ProviderStepHost,
  tools: ReadonlyMap<string, ToolDefinition>,
  promptContext: SystemPromptContext,
  discovery?: ToolDiscovery,
): StepFunction {
  const resolution = request.providerCredentialResolution;
  assertScopedModel(request.runtimeConfig, resolution);
  if (resolution.blocked) throw new Error(credentialBlockMessage(resolution.blocked));
  // Read once for the whole step function, not once per use: loading the
  // catalogue touches the filesystem, and a run that reloaded it mid-turn could
  // change request shape between two steps of the same answer.
  const catalog = request.providerCatalog ?? loadCatalog();
  const baseUrl = catalogBaseUrl(catalog, resolution.provider, resolution.baseUrl ?? resolution.credential?.baseUrl);
  if (catalogProvider(catalog, resolution.provider, baseUrl).ambiguous) throw new Error('The model catalogue has multiple entries for this endpoint. Resolve them before sending.');
  const endpoint = providerEndpoint(catalog, resolution.provider, baseUrl);
  const configuredTier = request.serviceTier ?? request.runtimeConfig?.providerConnections
    ?.find(item => item.id === resolution.credential?.connectionId)?.serviceTier
    ?? request.runtimeConfig?.providerCredentials?.[resolution.provider]?.serviceTier;
  if (configuredTier && serviceTierCapability(catalog, resolution.provider, resolution.model, configuredTier, baseUrl) !== 'supported') {
    throw new Error(`Configured service tier '${configuredTier}' is not verified for ${resolution.provider}/${resolution.model}.`);
  }
  const system = systemPromptSnapshot(request.agentMode, promptContext);
  const identity = credentialIdentityFor(resolution.provider, resolution.credential);
  return createStepFunction({
    requestPolicy: request.requestPolicy,
    modelTransport: providerModelTransport(request.runtimeConfig, endpoint, request.admission),
    provider: {
      // Built from the whole credential, not from its key alone. An account login
      // yields a token instead of a key, and formatting the header here from a
      // field it does not have is what sent an empty bearer.
      headers: providerAuthorization({
        apiKey: resolution.credential?.apiKey,
        accountAuth: accountAuthFor(resolution.provider, resolution.credential ?? {}),
        ...(endpoint ? { endpoint } : {}),
      }).headers,
      baseUrl: baseUrl ?? "",
      model: resolution.model ?? resolution.credential?.model ?? "",
      // The catalog is keyed by provider id, so the request shape cannot be
      // resolved without it.
      provider: resolution.provider,
      // Which endpoint kind this provider is reached through. Read from the
      // catalog rather than inferred from the provider id: the id names who
      // answers, and an endpoint is how they want to be asked.
      ...(endpoint ? { endpoint } : {}),
      ...(configuredTier ? { serviceTier: configuredTier } : {}),
      ...(identity ? { credentialId: identity.credentialId, credentialGeneration: identity.generation } : {}),
    },
    // Without this the request is sent with the global fetch, which has no
    // deadline: a provider that accepts the connection and then never answers
    // leaves the turn waiting forever, and the retry layer cannot rescue it
    // because it classifies a failure only after a response arrives.
    // The endpoint decides how its requests are authenticated, and for two of
    // them that is not a constant header: one signs, one carries a token that
    // expires. Both are applied by the transport, which is the only place a
    // request exists whole.
    fetchImpl: providerFetchForEndpoint(request.runtimeConfig, endpoint, endpointShape, request.admission),
    workspaceRoot: request.workspaceRoot,
    sessionId: request.sessionId,
    systemPrompt: system.text,
    systemPromptSources: system.sources,
    systemPromptFor: (agentMode, toolNames) => buildSystemPrompt(agentMode, { ...promptContext, toolNames }),
    thinkingEffort: request.thinkingEffort,
    thinkingEffortExplicit: request.thinkingEffortExplicit,
    tools: toolSchemas(tools),
    ...(discovery ? { toolSnapshot: () => toolSchemas(discovery.snapshot()) } : {}),
    catalog,
    // Sampling settings travel with the request, not with the provider: a
    // provider that ignores them still receives a well-formed request, and a
    // run that sets none keeps the step's own defaults.
    temperature: request.runtimeConfig?.temperature,
    topP: request.runtimeConfig?.topP,
    maxOutputTokens: request.runtimeConfig?.maxOutputTokens,
    ...(request.runtimeConfig?.contextWindow !== undefined ? { contextWindow: request.runtimeConfig.contextWindow } : {}),
    ...(request.runtimeConfig?.reserveTokens !== undefined ? { reserveTokens: request.runtimeConfig.reserveTokens } : {}),
    retry: {
      enabled: request.runtimeConfig?.retryEnabled,
      maxRetries: request.runtimeConfig?.providerRetryMaxRetries,
      baseDelayMs: request.runtimeConfig?.retryBaseDelayMs,
      maxDelayMs: request.runtimeConfig?.retryMaxDelayMs,
    },
  });
}

/** Each explicit delegated model is resolved once; unavailable targets never use the main step. */
export function delegatedSteps(request: ProviderStepHost, tools: ReadonlyMap<string, ToolDefinition>, context: SystemPromptContext,
  syntheticDefault?: StepFunction, discovery?: ToolDiscovery) {
  const renew = delegatedRenewal(request);
  const catalog = request.providerCatalog ?? loadCatalog();
  const select = (model: string | SessionModelRole, admission?: () => string | undefined, effort?: ThinkingPreference, providerScope?: 'current', workspace = request.workspaceRoot) => {
    if (request.providerMode === 'synthetic') {
      if (!model && effort === undefined && syntheticDefault) return { step: syntheticDefault, prepare: async () => {} };
      throw new Error('Independent model review is unavailable in synthetic provider mode.');
    }
    const main = request.providerCredentialResolution;
    const scoped = request.runtimeConfig ? scopedRuntimeConfig(request.runtimeConfig, workspace) : undefined;
    const runtimeConfig = scoped && request.runtimeConfig?.allowedModels !== undefined ? { ...scoped,
      allowedModels: mergeConfigValue(request.runtimeConfig.allowedModels, scoped.allowedModels ?? request.runtimeConfig.allowedModels, 'intersect') as readonly string[] } : scoped;
    const resolution = model ? providerScope === 'current' && typeof model === 'string'
      ? delegatedTarget(`${main.provider}/${model}`, main, undefined, catalog)
      : delegatedTarget(model, main, runtimeConfig, catalog) : main;
    const scopedAdmission = scopeAdmission(runtimeConfig?.configScopes, workspace);
    const admit = () => request.admission?.() ?? admission?.() ?? scopedAdmission();
    assertAdmission(admit);
    const requestPolicy = request.requestPolicy?.withAdmission?.(() => { const refusal = admit(); if (refusal) throw new Error(refusal); }) ?? request.requestPolicy;
    const selected = { ...request, providerCatalog: catalog, runtimeConfig, workspaceRoot: workspace, providerCredentialResolution: resolution,
      requestPolicy, admission: admit, ...(effort !== undefined ? { thinkingEffort: effort, thinkingEffortExplicit: true } : {}) };
    // Validate the captured request before any refresh side effect. Building a step does not send.
    let active = createProviderStep(selected, tools, context, discovery);
    let credential = resolution.credential?.accountAuth;
    const prepare = async (publication?: AccountPublication) => {
      const fresh = await renew(resolution, admit, publication);
      if (fresh.credential?.accountAuth !== credential) {
        active = createProviderStep({ ...selected, providerCredentialResolution: fresh }, tools, context, discovery);
        credential = fresh.credential?.accountAuth;
      }
    };
    const step: StepFunction = async (...args) => { args[1]?.throwIfAborted(); await prepare(); args[1]?.throwIfAborted(); return active(...args); };
    return { step, prepare };
  };
  return Object.assign((...args: Parameters<typeof select>): StepFunction => select(...args).step,
    { prepare: async (model: string | SessionModelRole, admission?: () => string | undefined, effort?: ThinkingPreference,
      workspace?: string, publication?: AccountPublication): Promise<void> => { await select(model, admission, effort, undefined, workspace).prepare(publication); } });
}
