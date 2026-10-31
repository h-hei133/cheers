import { providerCredentialEndpoint } from '../../auth/account/target.js';
import { configuredOutputLimit } from '../../../provider/request/output.js';
import { readRuntimeConfigEditAt, getUserRuntimeConfigPath, writeUserRuntimeConfigFile, isRuntimeProvider, type RuntimeConfig, type RuntimeConfigFile } from '../../../config/runtimeConfig.js';
import path from 'node:path';
import { ConfigWriteError } from '../../../config/outcome.js';
import { inspectConfigConstraints } from '../../../config/constraints.js';
import { sameValue } from '../../../config/values.js';
import { projectModelSelection, projectSessionModel } from '../../../session/model/projection.js';
import type { SessionModelPolicy, SessionModelTarget } from '../../../session/model/contract.js';
import { readSessionModelEdit, writeSessionModel, type SessionModelEdit, type SessionModelReceipt } from '../../../session/model/state.js';
import { SessionModelWriteError } from '../../../session/model/outcome.js';
import { defaultHookDispatcher } from '../../hooks/hookDispatcher.js';
import { loadCatalog } from '../../models/catalogStore.js';
import { providerFacts } from '../../providers/facts.js';
import { configurationApplicationNotice, readFreshConfiguration } from '../configuration.js';
import { globalModelFailure } from './outcome.js';
import { effortCapability } from '../../models/capability.js';
import { endpointShape } from '../../../provider/endpoints/index.js';
import { effortOutputFailure } from '../../../provider/endpoints/effort.js';
import { catalogBaseUrl, catalogModel, catalogProvider } from '../../models/catalog.js';
import type { ThinkingPreference } from '../../models/effort.js';
import type { CommandContext } from '../types.js';
import { connectionIdentity, credentialIdentity } from './identity.js';
import { invalidatePromptMeasurement } from '../../../observability/usageTelemetry.js';
import { captureThinkingPreference } from '../../models/preference.js';
import { exactTargetMatches, modelRequest, targetRequest, targetResolutionIdentity } from './target.js';

interface ExactSelection { readonly target: SessionModelTarget; readonly baseline?: SessionModelEdit; readonly roles?: SessionModelPolicy;
  readonly resolution?: string }
interface ReviewedTargetOptions { readonly baseline?: SessionModelEdit; readonly roles?: SessionModelPolicy; readonly resolution: string }

/** Legacy callers pass an exact address; provider targets still require a reviewed picker snapshot. */
export async function setModelTarget(target: SessionModelTarget, context: CommandContext, baseline?: SessionModelEdit,
  roles?: SessionModelPolicy): Promise<string> {
  return applyExactTarget(target, context, { baseline, roles });
}

/** Picker actions carry the full resolution shown at selection time. */
export async function setReviewedModelTarget(target: SessionModelTarget, context: CommandContext,
  options: ReviewedTargetOptions): Promise<string> {
  return applyExactTarget(target, context, options);
}

async function applyExactTarget(target: SessionModelTarget, context: CommandContext,
  options: Pick<ExactSelection, 'baseline' | 'roles' | 'resolution'>): Promise<string> {
  if (target.connectionId === undefined && !validResolution(options.resolution)) {
    return 'Model switch blocked: provider selection must come from the reviewed model picker.';
  }
  try {
    return await selectModel([], context, false, target.thinkingEffort ?? null,
      { target, baseline: options.baseline, roles: options.roles, resolution: options.resolution });
  }
  catch { return 'Model selection outcome is unverified. Inspect saved session preferences before retrying.'; }
}

function validResolution(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

export async function setModel(args: string[], context: CommandContext, global: boolean, requestedEffort?: ThinkingPreference): Promise<string> {
  try { return await selectModel(args, context, global, requestedEffort); }
  catch { return 'Model selection outcome is unverified. Inspect saved session and global preferences before retrying.'; }
}

async function selectModel(args: string[], context: CommandContext, global: boolean, requestedEffort?: ThinkingPreference, exact?: ExactSelection): Promise<string> {
  const target = exact?.target.model ?? args[0]?.trim();
  if (!target && requestedEffort === undefined) {
    return "Usage: /model use <provider>/<model>, or /model use <model> to keep the current provider.";
  }
  // A `provider/model` target names both; a bare name keeps the active provider.
  // Model ids can themselves contain slashes, so only a leading segment that is a
  // known provider is read as one.
  const separator = target?.indexOf("/") ?? -1;
  const prefix = separator > 0 ? target!.slice(0, separator) : undefined;
  const namedProvider = !exact && prefix && loadCatalog().some((entry) => entry.id === prefix) ? prefix : undefined;
  let model: string | undefined = namedProvider ? target!.slice(separator + 1) : target;
  if (namedProvider && !model) {
    return `\`${namedProvider}\` has no models listed. Name one: /model use ${namedProvider}/<model>.`;
  }
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  const config = edit.values;
  const loaded = readFreshConfiguration(context);
  const connections = loaded.providerConnections;
  const projected = projectSessionModel(loaded, context.sessionId);
  const effective = context.readConfiguration?.().config ?? context.runtimeConfig ?? projected;
  const actual = modelRequest(context, effective);
  if (!exact && (actual.blocked || !actual.credential)) return 'Model switch blocked: the current request credential is unavailable. Select a ready connection before changing its model or effort.';
  const providerSlot = exact ? exact.target.connectionId === undefined
    : !projected.activeProviderConnectionId && !actual.credential?.connectionId;
  const inferredConnection = !exact && !projected.activeProviderConnectionId && actual.credential?.connectionId !== undefined;
  const activeId = providerSlot ? undefined : exact?.target.connectionId ?? projected.activeProviderConnectionId ?? actual.credential?.connectionId;
  const activeConnection = connections.find((item) => item.id.trim() === activeId);
  const provider = exact?.target.provider ?? activeConnection?.provider ?? (providerSlot ? actual.provider : loaded.provider);
  if (!isRuntimeProvider(provider)) return 'Model switch blocked: the selected provider is unavailable.';
  if (!loaded.configValidation.valid) return 'Model switch blocked: the stored configuration is invalid. Correct it and reload before selecting a model.';
  if (!exact && (!matchesRequestProvider(context, projected, provider) || !matchesRequestProvider(context, effective, provider))) {
    return 'Model switch blocked: the request provider differs from the saved active connection. Select a matching connection with /connect use, or restart without the provider override.';
  }
  const fromModel = actual.model ?? 'default';
  model ??= actual.model;
  if (!model) return 'Model switch blocked: no concrete model is selected. Select one with /model use <model> before changing effort.';
  const thinkingEffort = requestedEffort === undefined
    ? captureThinkingPreference(context.projectRoot ?? context.cwd, actual.thinkingEffort).thinkingEffort : requestedEffort;
  const catalog = loadCatalog();
  const scoped = exact?.target ?? (providerSlot ? { connectionScope: 'provider' as const, provider, model, thinkingEffort }
    : inferredConnection ? { connectionId: activeId!, provider, model, thinkingEffort } : undefined);
  const request = scoped ? targetRequest(context, loaded, scoped) : undefined;
  if (scoped && exact?.resolution !== undefined && targetResolutionIdentity(context, loaded, scoped) !== exact.resolution) {
    return 'Model switch blocked: the selected credential or endpoint changed. Reopen the model picker.';
  }
  if (scoped && !exactTargetMatches(context, loaded, scoped)) return 'Model switch blocked: the selected credential binding is unavailable or request overrides change its target.';
  if (providerSlot && (!actual.credential || actual.blocked || actual.credential.connectionId !== undefined
    || actual.baseUrl !== request?.baseUrl || !sameValue({ ...actual.credential, model: undefined }, { ...request?.credential, model: undefined }))) {
    return 'Model switch blocked: the provider credential or endpoint differs from the current request. Reload before selecting a model.';
  }
  const baseUrl = request?.baseUrl ?? actual.baseUrl;
  if (catalogProvider(catalog, provider, baseUrl).ambiguous) return 'Model switch blocked: multiple catalogue entries claim this endpoint.';
  const capability = effortCapability(catalog, provider, model, thinkingEffort, baseUrl);
  const candidate = catalogModel(catalog, provider, model, catalogBaseUrl(catalog, provider, baseUrl));
  const selectedRequest = request ?? actual;
  const endpoint = providerCredentialEndpoint(catalog, selectedRequest, baseUrl);
  if (capability === 'unsupported') return 'Model switch blocked: this model does not support the selected reasoning effort. Choose another level or --effort auto.';
  // Publication reloads this cap; startup overrides currently declare no output limit.
  const budgetFailure = thinkingEffort === null ? undefined : effortOutputFailure(endpointShape(endpoint), configuredOutputLimit(loaded, endpoint) ?? (endpointShape(endpoint).outputControl === 'provider' ? undefined : candidate?.maxTokens));
  if (budgetFailure) return `Model switch blocked: ${budgetFailure}`;
  const capabilityNotice = !candidate ? 'Model catalogue entry is unavailable; capability is unverified. Use /model refresh or /model config. Remote availability is not verified.'
    : capability === 'unverified' ? 'Effort capability is unverified in the model catalogue. Use /model refresh or /model config to update metadata; remote availability is not verified.' : undefined;
  const constraints = inspectConfigConstraints(loaded, { provider, model, thinkingEffort, baseUrl, credential: selectedRequest.credential }, catalog);
  if (constraints.errors.length) return `Model switch blocked: ${constraints.errors.join(' ')}`;
  if (!providerSlot && !activeId) {
    return "No active connection. Run /connect login ... first.";
  }
  if (!providerSlot && !activeConnection) {
    return `Active connection not found: ${activeId}`;
  }
  if (global && !providerSlot && ((!inferredConnection && projected.sessionConnection === undefined && config.activeProviderConnectionId?.trim() !== activeId)
    || !config.providerConnections?.some(item => item.id.trim() === activeId)
    || loaded.configProvenance.providerConnections.files?.some(file => file.position !== undefined))) {
    return 'Global model save refused: the selected connection comes from a read-only config input. Save a session preference or edit its owning file explicitly.';
  }
  if (global && providerSlot && !providerDefaultWritable(loaded, provider)) {
    return 'Global model save refused: a connection, account pool or read-only config input owns these defaults. Save a session preference or edit its owning configuration.';
  }
  if (context.admission?.()) return 'Model switch blocked: session, workspace or configuration admission changed.';
  if ((context.runtimeConfig || context.readConfiguration) && ((!scoped && effective.activeProviderConnectionId?.trim() !== activeId)
    || !sameValue(connectionIdentity(effective.providerConnections?.find(item => item.id.trim() === activeId)), connectionIdentity(loaded.providerConnections.find(item => item.id === activeId)))
    || !sameValue(credentialIdentity(effective.providerCredentials?.[provider]), credentialIdentity(loaded.providerCredentials[provider])))) {
    return 'Model switch blocked: the stored connection differs from the accepted session configuration. Reload before selecting a model.';
  }
  // Switching model and switching provider are different acts with different
  // consequences — the second needs a credential — so a target naming a provider
  // that is not the active one is refused rather than half-applied.
  if (namedProvider && namedProvider !== provider) {
    return [
      `\`${model}\` belongs to \`${namedProvider}\`, and the active provider is \`${provider}\`.`,
      "",
      `Connect that provider first: /connect login ${namedProvider} --api-key <key>`,
      "Then switch to it with /connect use <connection-id>.",
    ].join("\n");
  }

  if (
    provider === "openai" &&
    (request?.credential?.authMode ?? activeConnection?.authType) === "account-auth" &&
    !(providerFacts("openai").accountAuthAllowedModels ?? []).includes(model)
  ) {
    return [
      `Model "${model}" is not supported for OpenAI account-auth.`,
      "Allowed models:",
      ...(providerFacts("openai").accountAuthAllowedModels ?? []).map((item) => `- ${item}`),
      "Tip: run /model list to inspect allowed account-auth models.",
    ].join("\n");
  }

  if (!context.sessionId && !global) return "Model switch blocked: an active session is required.";
  let sessionEdit: SessionModelEdit | undefined;
  try { if (context.sessionId) sessionEdit = exact?.baseline ?? readSessionModelEdit(context.sessionId); }
  catch (error) { return sessionFailure(error); }
  if (sessionEdit && context.projectRoot !== undefined
    && (sessionEdit.projectRoot === undefined || path.resolve(sessionEdit.projectRoot) !== path.resolve(context.projectRoot))) {
    return 'Model switch blocked: the saved session workspace differs from the current workspace.';
  }
  const preDecision = await defaultHookDispatcher.dispatch({
    eventName: "PreModelSwitch", sessionId: context.sessionId || 'model-switch',
    workspaceRoot: context.projectRoot ?? context.cwd, timestamp: new Date().toISOString(), fromModel, toModel: model,
  });
  if (preDecision?.decision === 'block') return 'Model switch blocked by hook policy.';
  if (context.admission?.()) return 'Model switch blocked: session, workspace or configuration admission changed.';
  // An asynchronous hook cannot authorize a choice based on replaced credentials
  // or a different active connection. Unrelated field edits remain independent.
  const beforeCommit = (): boolean => {
    const currentCatalog = loadCatalog();
    if (context.admission?.() || catalogProvider(currentCatalog, provider, baseUrl).ambiguous
      || !sameValue(catalogProvider(currentCatalog, provider, baseUrl), catalogProvider(catalog, provider, baseUrl))
      || !sameValue(catalogModel(currentCatalog, provider, model, catalogBaseUrl(currentCatalog, provider, baseUrl)), candidate)) return false;
    const currentConfig = readFreshConfiguration(context);
    if (global && providerSlot && !providerDefaultWritable(currentConfig, provider)) return false;
    // A forced target would hide a changed fallback or pool selection during the hook.
    if (inferredConnection && !sameValue(modelRequest(context, currentConfig), actual)) return false;
    // Retain the reviewed preference across the session/global stages so this
    // writer's own model publication is not mistaken for a changed credential.
    if (!scoped && !sameValue(modelRequest(context, projectModelSelection(currentConfig, sessionEdit?.selection)), actual)) return false;
    if (scoped ? (!exactTargetMatches(context, currentConfig, scoped) || !sameValue(targetRequest(context, currentConfig, scoped), request))
      : !matchesRequestProvider(context, projectSessionModel(currentConfig, context.sessionId), provider)) return false;
    if (currentConfig.activeProviderConnectionId !== loaded.activeProviderConnectionId
      || !sameValue(connectionIdentity(currentConfig.providerConnections.find(item => item.id === activeId)), connectionIdentity(activeConnection))
      || !sameValue(credentialIdentity(currentConfig.providerCredentials[provider]), credentialIdentity(loaded.providerCredentials[provider]))) return false;
    if (providerCredentialEndpoint(currentCatalog, selectedRequest, baseUrl) !== endpoint || !currentConfig.configValidation.valid
      || !sameValue([currentConfig.maxOutputTokens, currentConfig.contextWindow, currentConfig.reserveTokens, currentConfig.modelTokenBudgets, currentConfig.retryBaseDelayMs, currentConfig.retryMaxDelayMs],
        [loaded.maxOutputTokens, loaded.contextWindow, loaded.reserveTokens, loaded.modelTokenBudgets, loaded.retryBaseDelayMs, loaded.retryMaxDelayMs])) return false;
    if (inspectConfigConstraints(currentConfig, { provider, model, thinkingEffort, baseUrl, credential: selectedRequest.credential }, currentCatalog).errors.length) return false;
    const latest = readRuntimeConfigEditAt(edit.path).values;
    return latest.activeProviderConnectionId === config.activeProviderConnectionId && latest.provider === config.provider
      && sameValue(latest.providerConnections?.find(item => item.id.trim() === activeId), config.providerConnections?.find(item => item.id.trim() === activeId))
      && sameValue(latest.providerCredentials?.[provider], config.providerCredentials?.[provider]);
  };

  const updatedAt = new Date().toISOString();
  const nextConnections = (config.providerConnections ?? []).map((item) =>
    item.id.trim() === activeId ? { ...item, model, thinkingEffort, updatedAt } : item,
  );
  const activeProvider = provider;
  const next: RuntimeConfigFile = {
    ...config,
    provider: activeProvider,
    ...(providerSlot || inferredConnection ? {} : { activeProviderConnectionId: activeId }),
    providerConnections: nextConnections,
    ...(providerSlot ? { providerCredentials: {
      ...(config.providerCredentials ?? {}),
      [provider]: {
        ...(config.providerCredentials?.[provider] ?? {}),
        model, thinkingEffort,
      },
    } } : {}),
  };
  let receipt: SessionModelReceipt | undefined;
  const roles = exact?.roles ?? sessionEdit?.selection?.roles;
  if (context.sessionId) {
    try {
      receipt = writeSessionModel(context.sessionId, {
        ...(providerSlot ? { connectionScope: 'provider' as const } : { connectionId: activeId!,
          ...(exact || inferredConnection || sessionEdit?.selection?.connectionScope === 'session' ? { connectionScope: 'session' as const } : {}) }),
        provider,
        model,
        thinkingEffort,
        // Presets are session-owned named roles, not the active model. Preserve
        // them when switching the active target; a switch must not silently
        // delete resume-scoped controls.
        ...(sessionEdit?.selection?.presets ? { presets: sessionEdit.selection.presets } : {}),
        ...(roles ? { roles } : {}),
        // Skill listing is a session control and follows the session across
        // model changes. Service tier and context window are model-specific;
        // omitting them makes the new model resolve its own defaults.
        ...(sessionEdit?.selection?.skillful !== undefined ? { skillful: sessionEdit.selection.skillful } : {}),
      }, sessionEdit!, beforeCommit);
    } catch (error) {
      return sessionFailure(error);
    }
    // A different model is a different tokenizer: the previous prompt count no
    // longer describes what the next request will carry.
    invalidatePromptMeasurement(context.sessionId);
  }
  let configPath: string | undefined;
  if (global) {
    try {
      if (!beforeCommit()) throw new ConfigWriteError('conflict', 'unchanged');
      configPath = writeUserRuntimeConfigFile(next, edit);
    } catch (error) {
      return globalModelFailure(error, receipt);
    }
  }
  const applicationNotice = configurationApplicationNotice(context);
  if (applicationNotice) return [`Model preference saved for ${model}; reasoning effort: ${thinkingEffort ?? "auto (provider decides)"}.`, capabilityNotice, applicationNotice].filter(Boolean).join("\n");

  // Dispatch PostModelSwitch Hook
  await defaultHookDispatcher.dispatch({
    eventName: "PostModelSwitch",
    sessionId: context?.sessionId || "model-switch",
    workspaceRoot: context?.cwd || process.cwd(),
    timestamp: new Date().toISOString(),
    fromModel,
    toModel: model,
  });

  return [
    `Model switched to ${model}.`,
    `Reasoning effort: ${thinkingEffort ?? "auto (provider decides)"}.`,
    ...(capabilityNotice ? [capabilityNotice] : []),
    `Provider: ${provider}`,
    providerSlot ? `Credential source: ${request?.credential?.source}` : `Connection: ${activeId}`,
    context.sessionId ? "Scope: current session (saved for resume)." : "Scope: global default.",
    ...(configPath ? [`Global default stored at: ${configPath}`] : []),
  ].join("\n");
}

function sessionFailure(error: unknown): string {
  return `Model switch failed: session preference ${error instanceof SessionModelWriteError ? error.message : 'write outcome is unverified.'} Global defaults were not changed.`;
}

function matchesRequestProvider(context: CommandContext, config: RuntimeConfig, provider: string): boolean {
  return !context.resolveConfigTarget || context.resolveConfigTarget(config).provider === provider;
}
function providerDefaultWritable(config: RuntimeConfig, provider: RuntimeConfig['provider']): boolean {
  return !config.activeProviderConnectionId && !config.providerConnections.some(item => item.provider === provider)
    && !config.accountPool?.[provider] && !config.configProvenance.providerCredentials.files?.some(file => file.position !== undefined);
}
