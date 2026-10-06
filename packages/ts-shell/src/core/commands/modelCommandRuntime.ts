import { configurationApplicationNotice } from "./configuration.js";
import { ConfigWriteError } from '../../config/outcome.js';
import {
  RUNTIME_PROVIDERS,
  readUserRuntimeConfigFile,
  readRuntimeConfigEditAt, getUserRuntimeConfigPath,
  writeUserRuntimeConfigFile,
  type ProviderConnectionConfig,
  type RuntimeConfigFile, type RuntimeConfig,
  type RuntimeProvider,
} from "../../config/runtimeConfig.js";
import type { CommandContext, LocalCommandResult } from "./types.js";
import { parseModelArgs, modelSyntax } from "./model/syntax.js";
import { syntaxHelp } from "./syntax/projection.js";
import { projectSessionModel } from "../../session/model/projection.js";
import { writeSessionModel } from "../../session/model/state.js";
import { defaultHookDispatcher } from "../hooks/hookDispatcher.js";
import { loadCatalog, ensureUserCatalog, userCatalogPath } from "../models/catalogStore.js";
import { refreshCatalog } from "../models/catalogRefresh.js";
import { renderCatalog } from "../models/catalogSurface.js";
import { needsUserEndpoint, providerFacts } from "../providers/facts.js";

const MODELS_DEV_API_URL = "https://models.dev/api.json";

/**
 * The models an OpenAI account connection can use.
 *
 * Read from the provider's declaration rather than kept here. The same list was
 * spelled out in this file and in the login runtime, so a model added to one and
 * missed in the other would be offered by `/model list` and then refused by the
 * switch.
 */
function accountAuthModelFacts(): { readonly allowed: readonly string[]; readonly defaultModel?: string } {
  const facts = providerFacts("openai");
  return { allowed: facts.accountAuthAllowedModels ?? [], defaultModel: facts.accountAuthDefaultModel };
}

interface ModelsDevModelInfo {
  readonly id?: string;
  readonly name?: string;
}

interface ModelsDevProviderInfo {
  readonly id?: string;
  readonly name?: string;
  readonly models?: Record<string, ModelsDevModelInfo>;
}

export async function runModelCommand(
  args: string[],
  context: CommandContext,
): Promise<LocalCommandResult> {
  const parsed = parseModelArgs(args);
  if (!parsed.ok) return { kind: "local", output: `Invalid model arguments: ${parsed.reason}\n${getModelHelpText()}` };
  const action = parsed.action.name;
  const rest = [...parsed.args];
  if (!action) {
    return { kind: "local", output: renderCatalogView(context) };
  }
  if (action === "status") {
    return { kind: "local", output: renderModelStatus(context) };
  }
  if (action === "refresh") {
    const result = await refreshCatalog();
    return {
      kind: "local",
      output: result.ok
        ? `Catalogue refreshed: ${result.providers} providers, ${result.models} models, cached in \`${result.cachePath}\`. Your own entries in \`${userCatalogPath()}\` still win.`
        : `Catalogue refresh failed (${result.error}). The shipped catalogue is unchanged and still complete.`,
    };
  }
  if (action === "config") {
    const path = ensureUserCatalog();
    return {
      kind: "local",
      output: [
        `Your provider file is \`${path}\`.`,
        "",
        "An entry with a known provider id patches it — a different base URL, extra models, a different key variable. An unknown id adds a provider outright.",
      ].join("\n"),
    };
  }

  if (action === "list" || action === "ls") {
    return { kind: "local", output: await listModels(rest, parsed.flags.has("refresh"), context) };
  }

  if (action === "use" || action === "set") {
    return { kind: "local", output: await setModel(rest, context, parsed.flags.has("global")) };
  }
  if (action === "help" || action === "--help" || action === "-h") {
    return {
      kind: "local",
      output: getModelHelpText(),
    };
  }

  return { kind: "local", output: getModelHelpText() };
}
/**
 * The catalogue, with this session's connection state folded in.
 *
 * Bare `/model` answers "what can I use", which is a question about providers and
 * models together — the old bare form answered "what am I using", which is
 * `/model status`.
 */
function renderCatalogView(context: CommandContext): string {
  const config = context.runtimeConfig ?? projectSessionModel(readUserRuntimeConfigFile(), context.sessionId);
  const connections = normalizeConnections(config);
  const activeId = config.activeProviderConnectionId?.trim();
  const active = connections.find((item) => item.id === activeId);
  const activeProvider = active?.provider ?? config.provider;
  return renderCatalog({
    providers: loadCatalog(),
    connected: new Set(connections.map((connection) => connection.provider)),
    activeProvider,
    activeModel:
      normalizeText(active?.model) ??
      normalizeText(activeProvider ? config.providerCredentials?.[activeProvider]?.model : undefined),
    configPath: userCatalogPath(),
  });
}

function renderModelStatus(context: CommandContext): string {
  const config = context.runtimeConfig ?? projectSessionModel(readUserRuntimeConfigFile(), context.sessionId);
  const connections = normalizeConnections(config);
  const activeId = config.activeProviderConnectionId?.trim();
  const activeConnection = connections.find((item) => item.id === activeId);
  const provider = activeConnection?.provider ?? config.provider ?? "openai";
  const authType = activeConnection?.authType ?? "api-key";
  const model =
    normalizeText(activeConnection?.model) ??
    normalizeText(config.providerCredentials?.[provider]?.model) ??
    (provider === "openai" && authType === "account-auth"
      ? providerFacts("openai").accountAuthDefaultModel
      : undefined);

  return [
    "Model selection status",
    `Provider: ${provider}`,
    `Auth type: ${authType}`,
    `Active connection: ${activeId ?? "none"}`,
    `Model: ${model ?? "unset"}`,
    "",
    ...renderProviderReadinessLines({
      activeConnectionId: activeId,
      activeConnection,
      model,
    }),
    "",
    "Use /model list to inspect available models.",
    "Use /model use <model-id> to switch active model.",
  ].join("\n");
}

function renderProviderReadinessLines(input: {
  readonly activeConnectionId?: string;
  readonly activeConnection?: ProviderConnectionConfig;
  readonly model?: string;
}): string[] {
  if (!input.activeConnectionId) {
    return [
      "Provider readiness",
      "- Config status: no active connection selected.",
      "- Next: run /connect status, then /connect login or /connect use.",
    ];
  }

  if (!input.activeConnection) {
    return [
      "Provider readiness",
      `- Config status: active connection not found (${input.activeConnectionId}).`,
      "- Next: run /connect status, then /connect use <connection-id>.",
    ];
  }

  if (input.activeConnection.status === "pending") {
    return [
      "Provider readiness",
      "- Config status: connection setup is pending.",
      "- Next: finish the login/browser flow or rerun /connect login.",
    ];
  }

  if (input.activeConnection.status === "error") {
    return [
      "Provider readiness",
      "- Config status: connection setup is in error state.",
      "- Next: rerun /connect login for this provider.",
    ];
  }

  if (
    input.activeConnection.authType !== "account-auth" &&
    !input.activeConnection.apiKey?.trim()
  ) {
    return [
      "Provider readiness",
      "- Config status: credential missing for active connection.",
      `- Next: run /connect login ${input.activeConnection.provider} --api-key <key>.`,
    ];
  }

  if (
    needsUserEndpoint(input.activeConnection.provider) &&
    !input.activeConnection.baseUrl?.trim()
  ) {
    return [
      "Provider readiness",
      `- Config status: ${input.activeConnection.provider} requires base URL.`,
      `- Next: run /connect login ${input.activeConnection.provider} --api-key <key> --base-url <url> --model <model>.`,
    ];
  }

  if (!input.model) {
    return [
      "Provider readiness",
      "- Config status: active connection exists, but no model is selected.",
      "- Next: run /model list, then /model use <model-id>.",
    ];
  }

  return [
    "Provider readiness",
    "- Config status: active connection and model are configured.",
    "- Live check: run npm run verify:provider-readiness from the project root.",
    "- If the live check reports provider-network-inconclusive, retry later or check proxy/firewall/network.",
  ];
}

export interface ModelCatalog {
  readonly provider: RuntimeProvider;
  readonly models: readonly string[];
  readonly active?: string;
  /** True when the catalog came from a local fallback rather than the registry. */
  readonly offline: boolean;
}

/**
 * The model catalog as data, for callers that present a chooser rather than
 * text. Shares the provider, auth, and fallback resolution with `/model list` so
 * the two can never offer different models.
 */
export async function readModelCatalog(refresh = false, sessionId?: string, runtimeConfig?: RuntimeConfig): Promise<ModelCatalog> {
  const config = runtimeConfig ?? projectSessionModel(readUserRuntimeConfigFile(), sessionId);
  const connections = normalizeConnections(config);
  const activeId = config.activeProviderConnectionId?.trim();
  const activeConnection = connections.find((item) => item.id === activeId);
  const provider = activeConnection?.provider ?? config.provider ?? "openai";
  const authType = activeConnection?.authType;
  const active =
    normalizeText(activeConnection?.model) ??
    normalizeText(config.providerCredentials?.[provider]?.model);

  if (provider === "openai" && authType === "account-auth") {
    return { provider, models: accountAuthModelFacts().allowed, active, offline: false };
  }
  const fromApi = await fetchModelsFromModelsDev(provider, refresh);
  if (fromApi.length > 0) return { provider, models: fromApi, active, offline: false };
  return { provider, models: fallbackModelsForProvider(provider, authType), active, offline: true };
}

async function listModels(args: string[], refresh: boolean, context: CommandContext): Promise<string> {
  const providerHint = normalizeProvider(args[0]);
  if (args[0] && !providerHint) return "Unknown provider. Use /model to inspect the catalogue.";
  const config = context.runtimeConfig ?? projectSessionModel(readUserRuntimeConfigFile(), context.sessionId);
  const connections = normalizeConnections(config);
  const activeId = config.activeProviderConnectionId?.trim();
  const activeConnection = connections.find((item) => item.id === activeId);
  const provider = providerHint ?? activeConnection?.provider ?? config.provider ?? "openai";
  const authType = activeConnection?.authType;
  const activeModel =
    normalizeText(activeConnection?.model) ??
    normalizeText(config.providerCredentials?.[provider]?.model);

  if (provider === "openai" && authType === "account-auth") {
    return renderOpenAIAccountAuthModelList(activeModel);
  }

  const modelsFromApi = await fetchModelsFromModelsDev(provider, refresh);
  if (modelsFromApi.length === 0) {
    const fallback = fallbackModelsForProvider(provider, authType);
    return [
      `Models for provider=${provider}`,
      "(models.dev unavailable, fallback list)",
      ...fallback.map((model) =>
        model === activeModel ? `* ${model} (active)` : `- ${model}`,
      ),
      "",
      "Use /model use <model-id> to switch active model.",
    ].join("\n");
  }

  return [
    `Models for provider=${provider}`,
    "Source: models.dev/api.json (OpenAI-compatible provider catalog)",
    ...modelsFromApi.map((model) =>
      model === activeModel ? `* ${model} (active)` : `- ${model}`,
    ),
    "",
    "Use /model use <model-id> to switch active model.",
  ].join("\n");
}

async function setModel(args: string[], context: CommandContext, global: boolean): Promise<string> {
  const target = args[0]?.trim();
  if (!target) {
    return "Usage: /model use <provider>/<model>, or /model use <model> to keep the current provider.";
  }
  // A `provider/model` target names both; a bare name keeps the active provider.
  // Model ids can themselves contain slashes, so only a leading segment that is a
  // known provider is read as one.
  const separator = target.indexOf("/");
  const prefix = separator > 0 ? target.slice(0, separator) : undefined;
  const namedProvider = prefix && loadCatalog().some((entry) => entry.id === prefix) ? prefix : undefined;
  const model = namedProvider ? target.slice(separator + 1) : target;
  if (namedProvider && !model) {
    return `\`${namedProvider}\` has no models listed. Name one: /model use ${namedProvider}/<model>.`;
  }
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  const config = edit.values;
  const connections = normalizeConnections(config);
  const activeId = config.activeProviderConnectionId?.trim();
  const activeConnection = connections.find((item) => item.id === activeId);
  const provider = activeConnection?.provider ?? config.provider ?? "openai";
  const effective = projectSessionModel(config, context.sessionId);
  const fromModel = effective.providerConnections?.find(item => item.id === activeId)?.model ?? effective.providerCredentials?.[provider]?.model ?? "default";

  // Dispatch PreModelSwitch Hook
  const preDecision = await defaultHookDispatcher.dispatch({
    eventName: "PreModelSwitch",
    sessionId: context?.sessionId || "model-switch",
    workspaceRoot: context?.cwd || process.cwd(),
    timestamp: new Date().toISOString(),
    fromModel,
    toModel: model,
  });

  if (preDecision && preDecision.decision === "block") {
    return `Model switch blocked by hook policy: ${preDecision.reason || "Switch not allowed."}`;
  }
  if (!activeId) {
    return "No active connection. Run /connect login ... first.";
  }
  if (!activeConnection) {
    return `Active connection not found: ${activeId}`;
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
    !accountAuthModelFacts().allowed.includes(model)
  ) {
    return [
      `Model "${model}" is not supported for OpenAI account-auth.`,
      "Allowed models:",
      ...accountAuthModelFacts().allowed.map((item) => `- ${item}`),
      "Tip: run /model list to inspect allowed account-auth models.",
    ].join("\n");
  }

  const updatedAt = new Date().toISOString();
  const nextConnections = connections.map((item) =>
    item.id === activeId ? { ...item, model, updatedAt } : item,
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
        model,
      },
    },
  };
  if (!context.sessionId && !global) return "Model switch blocked: an active session is required.";
  if (context.sessionId) {
    try {
      writeSessionModel(context.sessionId, { connectionId: activeId, provider, model });
    } catch {
      return "Model switch failed: session preference write outcome is unverified. Global defaults were not changed.";
    }
  }
  let configPath: string | undefined;
  if (global) {
    try {
      configPath = writeUserRuntimeConfigFile(next, edit);
    } catch (error) {
      const applicationNotice = configurationApplicationNotice(context);
      if (error instanceof ConfigWriteError) return `${context.sessionId ? `Session model preference saved for ${model}. ` : ''}${error.message}${applicationNotice ? ` ${applicationNotice}` : ''}`;
      return context.sessionId
        ? `Session model switched to ${model}, but saving the global default failed. Global write outcome is unverified.`
        : "Saving the global model default failed. Global write outcome is unverified.";
    }
  }
  const applicationNotice = configurationApplicationNotice(context);
  if (applicationNotice) return `Model preference saved for ${model}. ${applicationNotice}`;

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
    `Provider: ${provider}`,
    `Connection: ${activeId}`,
    context.sessionId ? "Scope: current session (saved for resume)." : "Scope: global default.",
    ...(configPath ? [`Global default stored at: ${configPath}`] : []),
  ].join("\n");
}

async function fetchModelsFromModelsDev(
  provider: RuntimeProvider,
  forceRefresh: boolean,
): Promise<string[]> {
  const url = forceRefresh
    ? `${MODELS_DEV_API_URL}?t=${Date.now()}`
    : MODELS_DEV_API_URL;
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "cheers/ts-shell" },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      return [];
    }
    const payload = (await response.json()) as Record<
      string,
      ModelsDevProviderInfo
    >;
    const providerKey = needsUserEndpoint(provider)
      ? "openai"
      : provider;
    const providerInfo = payload[providerKey];
    if (!providerInfo?.models) {
      return [];
    }
    return Object.keys(providerInfo.models).sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

function renderOpenAIAccountAuthModelList(activeModel?: string): string {
  return [
    "Models for provider=openai (account-auth)",
    "Source: local account-auth allowed model set",
    ...accountAuthModelFacts().allowed.map((model) =>
      model === activeModel ? `* ${model} (active)` : `- ${model}`,
    ),
    "",
    "Use /model use <model-id> to switch active model.",
  ].join("\n");
}

function fallbackModelsForProvider(
  provider: RuntimeProvider,
  authType?: ProviderConnectionConfig["authType"],
): readonly string[] {
  // The only case that is not simply the provider's declared list: an account
  // login reaches a fixed set the service publishes, which is narrower than what
  // the API offers. Read from this provider's own declaration — asking a fixed
  // provider here would answer Google's login with OpenAI's models.
  const facts = providerFacts(provider);
  if (authType === "account-auth" && facts.accountAuthAllowedModels) {
    return facts.accountAuthAllowedModels;
  }
  return facts.fallbackModels;
}

function normalizeProvider(input?: string): RuntimeProvider | undefined {
  const value = input?.trim().toLowerCase();
  const normalized = value === "siliconflow" || value === "openai_compatible" ? "openai-compatible"
    : value === "gemini" ? "google" : value;
  return RUNTIME_PROVIDERS.find(provider => provider === normalized);
}

function normalizeConnections(config: { readonly providerConnections?: readonly ProviderConnectionConfig[] }): ProviderConnectionConfig[] {
  if (!config.providerConnections || config.providerConnections.length === 0) {
    return [];
  }
  return config.providerConnections
    .filter((item) => Boolean(item.id && item.provider))
    .map((item) => ({
      ...item,
      id: item.id.trim(),
      label: normalizeText(item.label),
      baseUrl: normalizeBaseUrl(item.baseUrl),
      model: normalizeText(item.model),
      apiKey: normalizeText(item.apiKey),
      status: item.status ?? "connected",
      createdAt: item.createdAt || new Date().toISOString(),
      updatedAt: item.updatedAt || new Date().toISOString(),
    }));
}

function normalizeText(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeBaseUrl(baseUrl?: string): string | undefined {
  const trimmed = normalizeText(baseUrl);
  if (!trimmed) {
    return undefined;
  }
  return trimmed.replace(/\/+$/, "");
}

function getModelHelpText(): string {
  return `Model selection commands\n${syntaxHelp(modelSyntax)}\n/model <model-id> [--global]\nDefault: current session, saved for resume. --global also changes the global default.`;
}
