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
    label: "SiliconFlow (OpenAI Compatible)",
    provider: "openai-compatible",
    defaultBaseUrl: "https://api.siliconflow.cn/v1",
    defaultModel: "deepseek-ai/DeepSeek-V4-Flash",
  },
  {
    id: "google",
    label: "Google Gemini (OpenAI Compatible)",
    provider: "google",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.5-flash",
  },
  {
    id: "antigravity",
    label: "Antigravity (OpenAI Compatible)",
    provider: "antigravity",
  },
  {
    id: "claudecode",
    label: "ClaudeCode (OpenAI Compatible)",
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
      label: "Google Gemini (OpenAI Compatible)",
      provider: "google",
      defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      defaultModel: "gemini-2.5-flash",
    };
  }

  if (normalized === "antigravity") {
    return {
      id: "antigravity",
      label: "Antigravity (OpenAI Compatible)",
      provider: "antigravity",
    };
  }

  if (normalized === "claudecode") {
    return {
      id: "claudecode",
      label: "ClaudeCode (OpenAI Compatible)",
      provider: "claudecode",
    };
  }

  return null;
}

export function isOpenAICompatibleStyleProvider(provider: RuntimeProvider): boolean {
  return (
    provider === "openai-compatible" ||
    provider === "google" ||
    provider === "antigravity" ||
    provider === "claudecode"
  );
}

export function buildConnectionId(provider: RuntimeProvider): string {
  return `${provider}-${Date.now().toString(36)}`;
}

export function parseArgsWithFlags(args: string[]): {
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

export function normalizeConnections(config: RuntimeConfigFile): ProviderConnectionConfig[] {
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
