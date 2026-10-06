import type {
  ProviderConnectionConfig,
  RuntimeConfigFile,
  RuntimeProvider,
} from "../../../config/runtimeConfig.js";
import type { ConnectPreset } from "./types.js";

export const CONNECT_PRESETS: readonly ConnectPreset[] = [
  {
    id: "openai",
    label: "OpenAI",
    provider: "openai",
    defaultModel: "gpt-4.1-mini",
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

  if (normalized === "google" || normalized === "gemini") {
    return {
      id: "google",
      label: "Google Gemini",
      provider: "google",
      defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      defaultModel: "gemini-2.5-flash",
    };
  }

  if (normalized === "antigravity") {
    return {
      id: "antigravity",
      label: "Antigravity",
      provider: "antigravity",
    };
  }

  if (normalized === "claudecode") {
    return {
      id: "claudecode",
      label: "Anthropic-compatible proxy",
      provider: "claudecode",
    };
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
