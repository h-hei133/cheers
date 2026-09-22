import {
  readUserRuntimeConfigFile,
  writeUserRuntimeConfigFile,
  type ProviderConnectionConfig,
  type RuntimeConfigFile,
  type RuntimeProvider,
} from "../../config/runtimeConfig.js";
import type { CommandContext, LocalCommandResult } from "./types.js";
import { parseArgsWithFlags } from "./connect/preset.js";
import { defaultHookDispatcher } from "../hooks/hookDispatcher.js";
import { loadCatalog, ensureUserCatalog, userCatalogPath } from "../models/catalogStore.js";
import { refreshCatalog } from "../models/catalogRefresh.js";
import { renderCatalog } from "../models/catalogSurface.js";

const MODELS_DEV_API_URL = "https://models.dev/api.json";
const OPENAI_ACCOUNT_AUTH_ALLOWED_MODELS = [
  "gpt-5.1-codex",
  "gpt-5.1-codex-max",
  "gpt-5.1-codex-mini",
  "gpt-5.2",
  "gpt-5.2-codex",
  "gpt-5.3-codex",
  "gpt-5.4",
  "gpt-5.4-mini",
] as const;
const OPENAI_ACCOUNT_AUTH_ALLOWED_MODEL_SET = new Set<string>(
  OPENAI_ACCOUNT_AUTH_ALLOWED_MODELS,
);
const OPENAI_ACCOUNT_AUTH_DEFAULT_MODEL = "gpt-5.4";

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
  const [action, ...rest] = args;
  if (!action) {
    return { kind: "local", output: renderCatalogView() };
  }
  if (action === "status") {
    return { kind: "local", output: renderModelStatus() };
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
    return { kind: "local", output: await listModels(rest) };
  }

  if (action === "use" || action === "set") {
    return { kind: "local", output: await setModel(rest, context) };
  }
  if (action === "help" || action === "--help" || action === "-h") {
    return {
      kind: "local",
      output: getModelHelpText(),
    };
  }

  if (action.startsWith("-")) {
    return {
      kind: "local",
      output: [
        `Unknown flag '${action}'.`,
        "Usage:",
        "- `/model` or `/model status` : Inspect active model and provider",
        "- `/model list` : List all available models",
        "- `/model <model-name>` : Switch model directly",
      ].join("\n"),
    };
  }
  const [modelArg] = args;
  if (!modelArg) {
    return { kind: "local", output: renderModelStatus() };
  }
  return { kind: "local", output: await setModel(args, context) };
}
/**
 * The catalogue, with this session's connection state folded in.
 *
 * Bare `/model` answers "what can I use", which is a question about providers and
 * models together — the old bare form answered "what am I using", which is
 * `/model status`.
 */
function renderCatalogView(): string {
  const config = readUserRuntimeConfigFile();
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

function renderModelStatus(): string {
  const config = readUserRuntimeConfigFile();
  const connections = normalizeConnections(config);
  const activeId = config.activeProviderConnectionId?.trim();
  const activeConnection = connections.find((item) => item.id === activeId);
  const provider = activeConnection?.provider ?? config.provider ?? "openai";
  const authType = activeConnection?.authType ?? "api-key";
  const model =
    normalizeText(activeConnection?.model) ??
    normalizeText(config.providerCredentials?.[provider]?.model) ??
    (provider === "openai" && authType === "account-auth"
      ? OPENAI_ACCOUNT_AUTH_DEFAULT_MODEL
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
    isOpenAICompatibleStyleProvider(input.activeConnection.provider) &&
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
export async function readModelCatalog(refresh = false): Promise<ModelCatalog> {
  const config = readUserRuntimeConfigFile();
  const connections = normalizeConnections(config);
  const activeId = config.activeProviderConnectionId?.trim();
  const activeConnection = connections.find((item) => item.id === activeId);
  const provider = activeConnection?.provider ?? config.provider ?? "openai";
  const authType = activeConnection?.authType;
  const active =
    normalizeText(activeConnection?.model) ??
    normalizeText(config.providerCredentials?.[provider]?.model);

  if (provider === "openai" && authType === "account-auth") {
    return { provider, models: OPENAI_ACCOUNT_AUTH_ALLOWED_MODELS, active, offline: false };
  }
  const fromApi = await fetchModelsFromModelsDev(provider, refresh);
  if (fromApi.length > 0) return { provider, models: fromApi, active, offline: false };
  return { provider, models: fallbackModelsForProvider(provider, authType), active, offline: true };
}

async function listModels(args: string[]): Promise<string> {
  const parsed = parseArgsWithFlags(args);
  const providerHint = normalizeProvider(parsed.positionals[0]);
  const config = readUserRuntimeConfigFile();
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

  const refresh = parsed.flags.refresh === true;
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

async function setModel(args: string[], context?: CommandContext): Promise<string> {
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
  const config = readUserRuntimeConfigFile();
  const connections = normalizeConnections(config);
  const activeId = config.activeProviderConnectionId?.trim();
  const activeConnection = connections.find((item) => item.id === activeId);
  const provider = activeConnection?.provider ?? config.provider ?? "openai";
  const fromModel = config.providerCredentials?.[provider]?.model || "default";

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
    !OPENAI_ACCOUNT_AUTH_ALLOWED_MODEL_SET.has(model)
  ) {
    return [
      `Model "${model}" is not supported for OpenAI account-auth.`,
      "Allowed models:",
      ...OPENAI_ACCOUNT_AUTH_ALLOWED_MODELS.map((item) => `- ${item}`),
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
  const configPath = writeUserRuntimeConfigFile(next);

  // The session carries the settings it started with, and this command has just
  // changed one of them on disk. Without re-reading, the token budgets resolved
  // per model would keep answering from the model that was active at startup —
  // the new model's window comes from the provider bridge and does update, so the
  // two would disagree in a way nothing reports.
  context?.refreshRuntimeConfig?.();

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
    `Stored at: ${configPath}`,
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
    const providerKey = isOpenAICompatibleStyleProvider(provider)
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
    ...OPENAI_ACCOUNT_AUTH_ALLOWED_MODELS.map((model) =>
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
  if (provider === "openai" && authType === "account-auth") {
    return OPENAI_ACCOUNT_AUTH_ALLOWED_MODELS;
  }
  if (provider === "openai") {
    return ["gpt-4.1-mini", "gpt-4.1", "gpt-5.4"];
  }
  if (provider === "anthropic") {
    return ["claude-sonnet-4-5", "claude-opus-4-1"];
  }
  if (provider === "google") {
    return ["gemini-2.5-flash", "gemini-2.5-pro"];
  }
  if (provider === "antigravity") {
    return ["gpt-4.1-mini", "gpt-4.1", "gpt-5.4"];
  }
  if (provider === "claudecode") {
    return ["gpt-4.1-mini", "gpt-4.1", "gpt-5.4"];
  }
  return ["deepseek-ai/DeepSeek-V4-Flash", "Qwen/Qwen2.5-Coder-32B-Instruct"];
}

function normalizeProvider(input?: string): RuntimeProvider | undefined {
  const normalized = input?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (normalized === "openai") {
    return "openai";
  }
  if (normalized === "anthropic") {
    return "anthropic";
  }
  if (
    normalized === "openai-compatible" ||
    normalized === "siliconflow" ||
    normalized === "openai_compatible"
  ) {
    return "openai-compatible";
  }
  if (normalized === "google" || normalized === "gemini") {
    return "google";
  }
  if (normalized === "antigravity") {
    return "antigravity";
  }
  if (normalized === "claudecode") {
    return "claudecode";
  }
  return undefined;
}

function normalizeConnections(config: RuntimeConfigFile): ProviderConnectionConfig[] {
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
  return [
    "Model selection commands",
    "/model",
    "/model status",
    "/model list [provider] [--refresh]",
    "/model use <model-id>",
    "",
    "Examples:",
    "- /model list",
    "- /model list openai --refresh",
    "- /model list google",
    "- /model use gpt-5.4",
  ].join("\n");
}

function isOpenAICompatibleStyleProvider(provider: RuntimeProvider): boolean {
  return (
    provider === "openai-compatible" ||
    provider === "google" ||
    provider === "antigravity" ||
    provider === "claudecode"
  );
}
