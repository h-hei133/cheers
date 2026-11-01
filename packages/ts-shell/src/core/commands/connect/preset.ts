import type {
  ProviderConnectionConfig,
  RuntimeProvider,
} from "../../../config/runtimeConfig.js";
import type { ConnectPreset } from "./types.js";

export const CONNECT_PRESETS: readonly ConnectPreset[] = [
  {
    id: "openai",
    label: "OpenAI",
    provider: "openai",
    // A model the shipped catalogue lists. This value is written into the new
    // connection and becomes the next request's model, so a name the catalogue
    // does not know leaves the user starting from a model missing from their
    // own `/model list` — and `/context` can only guess its capacity.
    defaultModel: "gpt-5.3",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    provider: "anthropic",
    defaultModel: "claude-sonnet-4-5",
  },
  {
    id: "siliconflow",
    label: "SiliconFlow",
    provider: "openai-compatible",
    defaultBaseUrl: "https://api.siliconflow.cn/v1",
    defaultModel: "deepseek-ai/DeepSeek-V4-Flash",
  },
  {
    id: "google",
    label: "Google Gemini",
    provider: "google",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.5-flash",
  },
  {
    id: "google-ai",
    label: "Google AI",
    provider: "google-ai",
    defaultBaseUrl: "https://generativelanguage.googleapis.com",
    defaultModel: "gemini-2.5-flash",
  },
  {
    id: "bedrock",
    label: "AWS Bedrock",
    provider: "bedrock",
    defaultModel: "anthropic.claude-sonnet-4-5-v1:0",
  },
  {
    id: "vertex",
    label: "Google Vertex",
    // No default base URL: this one names the account, so it is built from the
    // environment rather than written here — see where the connection resolves.
    provider: "vertex",
    defaultModel: "gemini-2.5-flash",
  },
  {
    id: "github-copilot",
    label: "GitHub Copilot",
    provider: "github-copilot",
    defaultModel: "gpt-4.1",
  },
  {
    id: "antigravity",
    label: "Antigravity",
    provider: "antigravity",
  },
  {
    id: "claudecode",
    label: "Anthropic-compatible proxy",
    provider: "claudecode",
  },
];

/**
 * The preset a name resolves to.
 *
 * The table answers first, so an id it already holds is never restated here.
 * What remains is the aliases: a name a user may type that is not a preset id.
 * `openai-compatible` deliberately names no model — the endpoint is the user's,
 * so any id here would be a guess written into their connection.
 */
export function resolveProviderTarget(input?: string): ConnectPreset | null {
  const normalized = input?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const preset = CONNECT_PRESETS.find(
    (candidate) => candidate.id === normalized,
  );
  if (preset) {
    return preset;
  }

  if (normalized === "openai-compatible") {
    return {
      id: "siliconflow",
      label: "OpenAI Compatible",
      provider: "openai-compatible",
    };
  }

  if (normalized === "gemini") {
    // The provider is `google`; only the name a user types is an alias.
    const google = CONNECT_PRESETS.find((candidate) => candidate.id === "google");
    return google ?? null;
  }

  return null;
}

export function buildConnectionId(provider: RuntimeProvider): string {
  return `${provider}-${Date.now().toString(36)}`;
}

export function parseFlagValue(value?: string | boolean): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  return normalizeOptional(value);
}

export function normalizeOptional(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function normalizeBaseUrl(baseUrl?: string): string | undefined {
  const trimmed = normalizeOptional(baseUrl);
  if (!trimmed) {
    return undefined;
  }
  return trimmed.replace(/\/+$/, "");
}

export function normalizeConnections(config: { readonly providerConnections?: readonly ProviderConnectionConfig[] }): ProviderConnectionConfig[] {
  if (!config.providerConnections || config.providerConnections.length === 0) {
    return [];
  }

  return config.providerConnections
    .filter((item) => Boolean(item.id && item.provider))
    .map((item) => ({
      ...item,
      id: item.id.trim(),
      label: normalizeOptional(item.label),
      baseUrl: normalizeBaseUrl(item.baseUrl),
      model: normalizeOptional(item.model),
      apiKey: normalizeOptional(item.apiKey),
      status: item.status ?? "connected",
      createdAt: item.createdAt || new Date().toISOString(),
      updatedAt: item.updatedAt || new Date().toISOString(),
    }));
}
