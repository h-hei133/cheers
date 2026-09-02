import type { RuntimeProvider } from "../../config/runtimeConfig.js";

/**
 * Provider and model catalogue.
 *
 * Model names repeat across providers — the same open-weight model is served by
 * half a dozen of them, at different prices and different endpoints — so a flat
 * list of model names cannot say which one a session is talking to. Everything
 * here is therefore addressed as provider plus model, and the catalogue is the
 * only place that mapping lives.
 *
 * This snapshot is what ships. It works with no network and no configuration; a
 * user's own file adds to it, and an explicit refresh replaces it with a current
 * one. What it must never be is the only way to reach a provider: a provider that
 * appeared this morning is added in the user's file, not by waiting for us.
 */

export type ProviderAuth = "api-key" | "oauth" | "none";

export interface CatalogModel {
  readonly id: string;
  /** Context window in tokens, when the provider publishes one. */
  readonly contextWindow?: number;
}

export interface CatalogProvider {
  readonly id: string;
  readonly label: string;
  /** Which request shape this provider speaks. */
  readonly runtime: RuntimeProvider;
  readonly auth: ProviderAuth;
  readonly baseUrl?: string;
  /** Environment variable conventionally holding the key. */
  readonly envVar?: string;
  readonly models: readonly CatalogModel[];
  /** True when the entry came from the user's own file rather than this snapshot. */
  readonly custom?: boolean;
}

const OPENAI_COMPATIBLE: RuntimeProvider = "openai-compatible";

/** Providers that ship with the shell, in the order a chooser should offer them. */
export const BUILTIN_PROVIDERS: readonly CatalogProvider[] = [
  {
    id: "anthropic",
    label: "Anthropic",
    runtime: "anthropic",
    auth: "api-key",
    envVar: "ANTHROPIC_API_KEY",
    models: [
      { id: "claude-opus-4-6", contextWindow: 200_000 },
      { id: "claude-sonnet-4-5", contextWindow: 200_000 },
      { id: "claude-haiku-4-5", contextWindow: 200_000 },
    ],
  },
  {
    id: "openai",
    label: "OpenAI",
    runtime: "openai",
    auth: "api-key",
    envVar: "OPENAI_API_KEY",
    models: [
      { id: "gpt-5.3", contextWindow: 400_000 },
      { id: "gpt-5.3-codex", contextWindow: 400_000 },
      { id: "gpt-5.1-mini", contextWindow: 400_000 },
      { id: "o4-mini", contextWindow: 200_000 },
    ],
  },
  {
    id: "google",
    label: "Google Gemini",
    runtime: "google",
    auth: "api-key",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    envVar: "GEMINI_API_KEY",
    models: [
      { id: "gemini-3-pro", contextWindow: 1_048_576 },
      { id: "gemini-2.5-flash", contextWindow: 1_048_576 },
      { id: "gemini-2.5-pro", contextWindow: 1_048_576 },
    ],
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    runtime: OPENAI_COMPATIBLE,
    auth: "api-key",
    baseUrl: "https://api.deepseek.com/v1",
    envVar: "DEEPSEEK_API_KEY",
    models: [
      { id: "deepseek-chat", contextWindow: 128_000 },
      { id: "deepseek-reasoner", contextWindow: 128_000 },
    ],
  },
  {
    id: "siliconflow",
    label: "SiliconFlow",
    runtime: OPENAI_COMPATIBLE,
    auth: "api-key",
    baseUrl: "https://api.siliconflow.cn/v1",
    envVar: "SILICONFLOW_API_KEY",
    models: [
      { id: "deepseek-ai/DeepSeek-V4-Flash", contextWindow: 128_000 },
      { id: "deepseek-ai/DeepSeek-V3.2", contextWindow: 128_000 },
      { id: "Qwen/Qwen3-235B-A22B", contextWindow: 128_000 },
    ],
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    runtime: OPENAI_COMPATIBLE,
    auth: "api-key",
    baseUrl: "https://openrouter.ai/api/v1",
    envVar: "OPENROUTER_API_KEY",
    models: [
      { id: "anthropic/claude-sonnet-4.5", contextWindow: 200_000 },
      { id: "openai/gpt-5.3", contextWindow: 400_000 },
      { id: "google/gemini-3-pro", contextWindow: 1_048_576 },
      { id: "deepseek/deepseek-chat", contextWindow: 128_000 },
    ],
  },
  {
    id: "xai",
    label: "xAI",
    runtime: OPENAI_COMPATIBLE,
    auth: "api-key",
    baseUrl: "https://api.x.ai/v1",
    envVar: "XAI_API_KEY",
    models: [
      { id: "grok-4", contextWindow: 256_000 },
      { id: "grok-4-fast", contextWindow: 256_000 },
    ],
  },
  {
    id: "groq",
    label: "Groq",
    runtime: OPENAI_COMPATIBLE,
    auth: "api-key",
    baseUrl: "https://api.groq.com/openai/v1",
    envVar: "GROQ_API_KEY",
    models: [
      { id: "llama-4-maverick-17b-128e", contextWindow: 128_000 },
      { id: "qwen3-32b", contextWindow: 128_000 },
    ],
  },
  {
    id: "mistral",
    label: "Mistral",
    runtime: OPENAI_COMPATIBLE,
    auth: "api-key",
    baseUrl: "https://api.mistral.ai/v1",
    envVar: "MISTRAL_API_KEY",
    models: [
      { id: "mistral-large-latest", contextWindow: 128_000 },
      { id: "devstral-medium-latest", contextWindow: 128_000 },
    ],
  },
  {
    id: "together",
    label: "Together AI",
    runtime: OPENAI_COMPATIBLE,
    auth: "api-key",
    baseUrl: "https://api.together.xyz/v1",
    envVar: "TOGETHER_API_KEY",
    models: [
      { id: "deepseek-ai/DeepSeek-V3", contextWindow: 128_000 },
      { id: "Qwen/Qwen3-235B-A22B-Instruct", contextWindow: 128_000 },
    ],
  },
  {
    id: "fireworks",
    label: "Fireworks AI",
    runtime: OPENAI_COMPATIBLE,
    auth: "api-key",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    envVar: "FIREWORKS_API_KEY",
    models: [
      { id: "accounts/fireworks/models/deepseek-v3", contextWindow: 128_000 },
      { id: "accounts/fireworks/models/qwen3-235b-a22b", contextWindow: 128_000 },
    ],
  },
  {
    id: "cerebras",
    label: "Cerebras",
    runtime: OPENAI_COMPATIBLE,
    auth: "api-key",
    baseUrl: "https://api.cerebras.ai/v1",
    envVar: "CEREBRAS_API_KEY",
    models: [
      { id: "qwen-3-coder-480b", contextWindow: 128_000 },
      { id: "llama-4-scout-17b", contextWindow: 128_000 },
    ],
  },
  {
    id: "moonshot",
    label: "Moonshot",
    runtime: OPENAI_COMPATIBLE,
    auth: "api-key",
    baseUrl: "https://api.moonshot.cn/v1",
    envVar: "MOONSHOT_API_KEY",
    models: [
      { id: "kimi-k2-turbo-preview", contextWindow: 256_000 },
      { id: "moonshot-v1-128k", contextWindow: 128_000 },
    ],
  },
  {
    id: "zhipu",
    label: "Zhipu",
    runtime: OPENAI_COMPATIBLE,
    auth: "api-key",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    envVar: "ZHIPU_API_KEY",
    models: [
      { id: "glm-4.7", contextWindow: 128_000 },
      { id: "glm-4.6-air", contextWindow: 128_000 },
    ],
  },
  {
    id: "dashscope",
    label: "Alibaba DashScope",
    runtime: OPENAI_COMPATIBLE,
    auth: "api-key",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    envVar: "DASHSCOPE_API_KEY",
    models: [
      { id: "qwen3-max", contextWindow: 256_000 },
      { id: "qwen3-coder-plus", contextWindow: 256_000 },
    ],
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    runtime: OPENAI_COMPATIBLE,
    auth: "none",
    baseUrl: "http://localhost:11434/v1",
    models: [{ id: "qwen3-coder" }, { id: "llama4" }],
  },
  {
    id: "lmstudio",
    label: "LM Studio (local)",
    runtime: OPENAI_COMPATIBLE,
    auth: "none",
    baseUrl: "http://localhost:1234/v1",
    models: [{ id: "local-model" }],
  },
  {
    id: "vllm",
    label: "vLLM (local)",
    runtime: OPENAI_COMPATIBLE,
    auth: "none",
    baseUrl: "http://localhost:8000/v1",
    models: [{ id: "local-model" }],
  },
  {
    id: "antigravity",
    label: "Antigravity",
    runtime: "antigravity",
    auth: "api-key",
    models: [],
  },
  {
    // The runtime id is kept as it is: it is a value users already have in their
    // configuration, and renaming it would silently orphan those connections.
    id: "claudecode",
    label: "Anthropic-compatible proxy",
    runtime: "claudecode",
    auth: "api-key",
    models: [],
  },
];

/** A provider by id, from the built-in snapshot alone. */
export function builtinProvider(id: string): CatalogProvider | undefined {
  return BUILTIN_PROVIDERS.find((provider) => provider.id === id);
}

/**
 * Merge a user's entries over the snapshot.
 *
 * An entry with a known id patches that provider — a different base URL for a
 * proxy in front of it, extra models, a different key variable. An unknown id
 * adds a provider outright, which is how a provider we have never heard of
 * becomes usable without waiting for a release.
 */
export function mergeProviders(
  base: readonly CatalogProvider[],
  overlay: readonly Partial<CatalogProvider>[],
): CatalogProvider[] {
  const merged = base.map((provider) => ({ ...provider }));
  for (const patch of overlay) {
    if (!patch.id) continue;
    const index = merged.findIndex((provider) => provider.id === patch.id);
    if (index < 0) {
      merged.push({
        id: patch.id,
        label: patch.label ?? patch.id,
        runtime: patch.runtime ?? "openai-compatible",
        auth: patch.auth ?? "api-key",
        baseUrl: patch.baseUrl,
        envVar: patch.envVar,
        models: patch.models ?? [],
        custom: true,
      });
      continue;
    }
    const existing = merged[index]!;
    merged[index] = {
      ...existing,
      ...patch,
      // A user's models add to what ships rather than replacing it, so patching a
      // base URL does not quietly cost them the model list.
      models: patch.models ? dedupeModels([...existing.models, ...patch.models]) : existing.models,
      custom: true,
    };
  }
  return merged;
}

function dedupeModels(models: readonly CatalogModel[]): CatalogModel[] {
  const byId = new Map<string, CatalogModel>();
  for (const model of models) byId.set(model.id, model);
  return [...byId.values()];
}
