import { getRuntimeConfig, readRuntimeConfigEditAt, getUserRuntimeConfigPath, writeUserRuntimeConfigFile, type RuntimeConfig, type RuntimeConfigFile, type ProviderConnectionConfig, type ProviderCredentialConfig } from '../../../config/runtimeConfig.js';
import path from 'node:path';
import { ConfigWriteError } from '../../../config/outcome.js';
import { inspectConfigConstraints } from '../../../config/constraints.js';
import { sameValue } from '../../../config/values.js';
import { projectSessionModel } from '../../../session/model/projection.js';
import { readSessionModelEdit, writeSessionModel, type SessionModelEdit, type SessionModelReceipt } from '../../../session/model/state.js';
import { SessionModelWriteError } from '../../../session/model/outcome.js';
import { defaultHookDispatcher } from '../../hooks/hookDispatcher.js';
import { loadCatalog } from '../../models/catalogStore.js';
import { providerFacts } from '../../providers/facts.js';
import { configurationApplicationNotice } from '../configuration.js';
import { currentModelPreference } from './preference.js';
import { globalModelFailure } from './outcome.js';
import { effortCapability } from '../../models/capability.js';
import { endpointShape } from '../../../provider/endpoints/index.js';
import { effortOutputFailure } from '../../../provider/endpoints/effort.js';
import { catalogModel, providerEndpoint } from '../../models/catalog.js';
import type { ThinkingPreference } from '../../models/effort.js';
import type { CommandContext } from '../types.js';

export async function setModel(args: string[], context: CommandContext, global: boolean, requestedEffort?: ThinkingPreference): Promise<string> {
  try { return await selectModel(args, context, global, requestedEffort); }
  catch { return 'Model selection outcome is unverified. Inspect saved session and global preferences before retrying.'; }
}

async function selectModel(args: string[], context: CommandContext, global: boolean, requestedEffort?: ThinkingPreference): Promise<string> {
  const target = args[0]?.trim();
  if (!target && requestedEffort === undefined) {
    return "Usage: /model use <provider>/<model>, or /model use <model> to keep the current provider.";
  }
  // A `provider/model` target names both; a bare name keeps the active provider.
  // Model ids can themselves contain slashes, so only a leading segment that is a
  // known provider is read as one.
  const separator = target?.indexOf("/") ?? -1;
  const prefix = separator > 0 ? target!.slice(0, separator) : undefined;
  const namedProvider = prefix && loadCatalog().some((entry) => entry.id === prefix) ? prefix : undefined;
  let model: string | undefined = namedProvider ? target!.slice(separator + 1) : target;
  if (namedProvider && !model) {
    return `\`${namedProvider}\` has no models listed. Name one: /model use ${namedProvider}/<model>.`;
  }
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  const config = edit.values;
  const connections = config.providerConnections ?? [];
  const activeId = config.activeProviderConnectionId?.trim();
  const activeConnection = connections.find((item) => item.id.trim() === activeId);
  const provider = activeConnection?.provider ?? config.provider ?? "openai";
  const loaded = getRuntimeConfig(context.projectRoot ?? context.cwd);
  if (!loaded.configValidation.valid) return 'Model switch blocked: the stored configuration is invalid. Correct it and reload before selecting a model.';
  const effective = context.runtimeConfig ?? projectSessionModel(loaded, context.sessionId);
  if (!matchesRequestProvider(context, loaded, provider) || !matchesRequestProvider(context, effective, provider)) {
    return 'Model switch blocked: the request provider differs from the saved active connection. Select a matching connection with /connect use, or restart without the provider override.';
  }
  const current = currentModelPreference(effective, context.projectRoot ?? context.cwd);
  const fromModel = current.model ?? 'default';
  model ??= current.model;
  if (!model) return 'Model switch blocked: no concrete model is selected. Select one with /model use <model> before changing effort.';
  const thinkingEffort = requestedEffort === undefined ? current.thinkingEffort : requestedEffort;
  const catalog = loadCatalog();
  const capability = effortCapability(catalog, provider, model, thinkingEffort);
  const candidate = catalogModel(catalog, provider, model);
  const endpoint = providerEndpoint(catalog, provider);
  // Publication reloads this cap; startup overrides currently declare no output limit.
  const budgetFailure = thinkingEffort === null ? undefined : effortOutputFailure(endpointShape(endpoint), loaded.maxOutputTokens ?? candidate?.maxTokens);
  if (budgetFailure) return `Model switch blocked: ${budgetFailure}`;
  const capabilityNotice = !candidate ? 'Model catalogue entry is unavailable; capability is unverified. Use /model refresh or /model config. Remote availability is not verified.'
    : capability === 'unverified' ? 'Effort capability is unverified in the model catalogue. Use /model refresh or /model config to update metadata; remote availability is not verified.' : undefined;
  if (capability === 'unsupported') return 'Model switch blocked: this model does not support the selected reasoning effort. Choose another level or --effort auto.';
  const constraints = inspectConfigConstraints(loaded, { provider, model, thinkingEffort }, catalog);
  if (constraints.errors.length) return `Model switch blocked: ${constraints.errors.join(' ')}`;
  if (!activeId) {
    return "No active connection. Run /connect login ... first.";
  }
  if (!activeConnection) {
    return `Active connection not found: ${activeId}`;
  }
  if (context.admission?.()) return 'Model switch blocked: session, workspace or configuration admission changed.';
  if (context.runtimeConfig && (effective.activeProviderConnectionId?.trim() !== activeId
    || !sameValue(connectionIdentity(effective.providerConnections?.find(item => item.id.trim() === activeId)), connectionIdentity(loaded.providerConnections.find(item => item.id === activeId)))
    || !sameValue(credentialIdentity(effective.providerCredentials?.[provider]), credentialIdentity(loaded.providerCredentials[provider])))) {
    return 'Model switch blocked: the stored connection differs from the accepted session configuration. Reload before selecting a model.';
  }
  // Switching model and switching provider are different acts with different
  // consequences — the second needs a credential — so a target naming a provider
  // that is not the active one is refused rather than half-applied.
  if (namedProvider && namedProvider !== activeConnection.provider) {
    return [
      `\`${model}\` belongs to \`${namedProvider}\`, and the active connection is \`${activeConnection.provider}\`.`,
      "",
      `Connect that provider first: /connect login ${namedProvider} --api-key <key>`,
      "Then switch to it with /connect use <connection-id>.",
    ].join("\n");
  }

  if (
    activeConnection.provider === "openai" &&
    activeConnection.authType === "account-auth" &&
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
  try { if (context.sessionId) sessionEdit = readSessionModelEdit(context.sessionId); }
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
    if (context.admission?.() || !sameValue(catalogModel(currentCatalog, provider, model), candidate)) return false;
    const currentConfig = getRuntimeConfig(context.projectRoot ?? context.cwd);
    if (!matchesRequestProvider(context, currentConfig, provider)) return false;
    if (providerEndpoint(currentCatalog, provider) !== endpoint || !currentConfig.configValidation.valid
      || !sameValue([currentConfig.maxOutputTokens, currentConfig.contextWindow, currentConfig.reserveTokens, currentConfig.modelTokenBudgets, currentConfig.retryBaseDelayMs, currentConfig.retryMaxDelayMs],
        [loaded.maxOutputTokens, loaded.contextWindow, loaded.reserveTokens, loaded.modelTokenBudgets, loaded.retryBaseDelayMs, loaded.retryMaxDelayMs])) return false;
    if (inspectConfigConstraints(currentConfig, { provider, model, thinkingEffort }, currentCatalog).errors.length) return false;
    const latest = readRuntimeConfigEditAt(edit.path).values;
    return latest.activeProviderConnectionId === config.activeProviderConnectionId && latest.provider === config.provider
      && sameValue(latest.providerConnections?.find(item => item.id.trim() === activeId), activeConnection)
      && sameValue(latest.providerCredentials?.[provider], config.providerCredentials?.[provider]);
  };

  const updatedAt = new Date().toISOString();
  const nextConnections = connections.map((item) =>
    item.id.trim() === activeId ? { ...item, model, thinkingEffort, updatedAt } : item,
  );
  const activeProvider = activeConnection.provider;
  const next: RuntimeConfigFile = {
    ...config,
    provider: activeProvider,
    activeProviderConnectionId: activeId,
    providerConnections: nextConnections,
    providerCredentials: {
      ...(config.providerCredentials ?? {}),
      [provider]: {
        ...(config.providerCredentials?.[provider] ?? {}),
        model, thinkingEffort,
      },
    },
  };
  let receipt: SessionModelReceipt | undefined;
  if (context.sessionId) {
    try {
      receipt = writeSessionModel(context.sessionId, { connectionId: activeId, provider, model, thinkingEffort }, sessionEdit!, beforeCommit);
    } catch (error) {
      return sessionFailure(error);
    }
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
    `Connection: ${activeId}`,
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

function connectionIdentity(connection: ProviderConnectionConfig | undefined): object | undefined {
  if (!connection) return undefined;
  const { model, thinkingEffort, createdAt, updatedAt, label, ...identity } = connection;
  return identity;
}

function credentialIdentity(credential: ProviderCredentialConfig | undefined): object | undefined {
  if (!credential) return undefined;
  const { model, thinkingEffort, ...identity } = credential;
  return Object.keys(identity).length ? identity : undefined;
}
