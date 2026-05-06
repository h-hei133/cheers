import {
  readUserRuntimeConfigFile,
  writeUserRuntimeConfigFile,
  type ProviderConnectionConfig,
  type RuntimeConfigFile,
  type RuntimeProvider,
} from "../../config/runtimeConfig.js";
import type { CommandContext, LocalCommandResult } from "./types.js";

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
  _context: CommandContext,
): Promise<LocalCommandResult> {
  const [action, ...rest] = args;
  if (!action || action === "status") {
    return { kind: "local", output: renderModelStatus() };
  }

  if (action === "list" || action === "ls") {
    return { kind: "local", output: await listModels(rest) };
  }

  if (action === "use" || action === "set") {
    return { kind: "local", output: setModel(rest) };
  }

  return {
    kind: "local",
    output: getModelHelpText(),
  };
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
    "Source: models.dev/api.json (opencode-compatible)",
    ...modelsFromApi.map((model) =>
      model === activeModel ? `* ${model} (active)` : `- ${model}`,
    ),
    "",
    "Use /model use <model-id> to switch active model.",
  ].join("\n");
}

function setModel(args: string[]): string {
  const model = normalizeText(args[0]);
  if (!model) {
    return "Usage: /model use <model-id>";
  }

  const config = readUserRuntimeConfigFile();
  const activeId = config.activeProviderConnectionId?.trim();
  if (!activeId) {
    return "No active connection. Run /connect login ... first.";
  }

  const connections = normalizeConnections(config);
  const activeConnection = connections.find((item) => item.id === activeId);
  if (!activeConnection) {
    return `Active connection not found: ${activeId}`;
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
  const provider = activeConnection.provider;
  const next: RuntimeConfigFile = {
    ...config,
    provider,
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
      headers: { "User-Agent": "private-coding-agents/ts-shell" },
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
    "Source: codex allowed model set (aligned with opencode codex plugin)",
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

function parseArgsWithFlags(args: string[]): {
  positionals: string[];
  flags: Record<string, string | boolean>;
} {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }
    const key = token.slice(2).trim().toLowerCase();
    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
      continue;
    }
    flags[key] = next;
    index += 1;
  }
  return { positionals, flags };
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
