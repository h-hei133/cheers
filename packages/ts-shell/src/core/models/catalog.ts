import type { RuntimeProvider } from "../../config/runtimeConfig.js";
import type { EndpointKind } from "../../provider/endpoints/kinds.js";

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
  /**
   * What this model charges, when the publisher states it.
   *
   * Optional because most entries in the snapshot do not carry prices, and a
   * guess would be worse than an admission: a cost report that silently
   * substitutes a made-up rate reads like a measurement.
   */
  readonly cost?: ModelCostRates;
  /**
   * Whether this model accepts a reasoning setting.
   *
   * Absent means capable, which is what the request assumed before the catalog
   * could answer: the level went out and a host that did not want it said so.
   * `false` is the only value that stops the field being sent, and it is for a
   * model that is known to reject it.
   */
  readonly reasoning?: boolean;
  /**
   * What this model calls each reasoning level.
   *
   * Endpoints disagree about the names — one takes `low`, another `minimal`,
   * another a number. A level mapped to `null` is one this model does not have,
   * and the nearest supported level is used instead. An unmapped level travels
   * as its own name, which is right for the endpoints that do use them.
   */
  readonly thinkingLevelMap?: Partial<Record<ThinkingLevel, string | null>>;
  /**
   * The output ceiling this model applies when the request does not set one.
   *
   * Separate from the run-wide `maxOutputTokens` because the ceiling is a
   * property of the model: a value that fits one is truncated by another.
   */
  readonly maxTokens?: number;
  /**
   * How this model wants the request shaped.
   *
   * Absent means the defaults an OpenAI-compatible endpoint expects, which is
   * what every shipped entry is. It is here because the differences are real:
   * an endpoint that refuses the `developer` role, or that only accepts
   * `max_completion_tokens`, fails on a request that is otherwise correct.
   */
  readonly compat?: ModelRequestShape;
  /**
   * How long the provider keeps this model's prompt cached, in seconds.
   *
   * Absent means the model does not cache, or the provider does not publish how
   * long it does — both of which leave nothing to schedule against. A refresh
   * sent before the window lapses keeps the prefix cached; one sent after is a
   * full-price rewrite, so without a window there is no safe time to send it.
   */
  readonly promptCache?: {
    /** The default retention tier. */
    readonly short?: number;
    /** The extended tier, where the provider offers one. */
    readonly long?: number;
  };
  /**
   * Whether this model accepts images.
   *
   * Declared rather than guessed from the model's name. A name is a label the
   * provider chose, and matching on it means a rename silently changes whether a
   * picture can be sent — while a model that does accept them would have its
   * images refused for looking unlike what the pattern expected.
   *
   * Absent means unknown, which is treated as "no": sending an image to a model
   * that cannot read one fails the whole request, while describing it in words
   * still reaches the model.
   */
  readonly vision?: boolean;
}

/** How one model wants a request shaped, when it differs from the default. */
export interface ModelRequestShape {
  /**
   * Which role carries the system instruction.
   *
   * Some endpoints accept `developer` and prefer it for reasoning models;
   * others reject anything but `system`.
   */
  readonly systemRole?: "system" | "developer";
  /**
   * The field that carries the output ceiling.
   *
   * OpenAI moved to `max_completion_tokens` for newer models and rejects
   * `max_tokens` on them; compatible endpoints vary.
   */
  readonly maxTokensField?: "max_tokens" | "max_completion_tokens";
  /**
   * Whether the reasoning level is sent as `reasoning_effort`.
   *
   * False means the field is never sent, so a level set for the project does
   * not become a rejected request.
   */
  readonly reasoningEffort?: boolean;
  /**
   * Whether a user message may follow tool results directly.
   *
   * Some endpoints require an assistant turn in between. Where they do, the
   * request is bridged with a synthetic assistant message rather than reordered,
   * because reordering would change what the conversation says.
   */
  readonly assistantAfterToolResult?: boolean;
  /**
   * Whether the model accepts a reasoning block whose signature is empty.
   *
   * Absent means it was not declared, which is treated as no. An endpoint that
   * validates signatures rejects an unsigned block, so the reasoning is sent as
   * ordinary content instead; one that issues no signatures accepts the empty
   * one, and saying so keeps the block typed as reasoning.
   */
  readonly allowEmptySignature?: boolean;
  /**
   * Whether the model accepts a sampling temperature.
   *
   * Absent means it was not declared, which is treated as yes: a temperature was
   * always sent before the catalogue could describe a model, and a host that
   * disliked it said so. `false` is for a model known to reject the field —
   * sending it anyway fails the whole request rather than being ignored.
   */
  readonly supportsTemperature?: boolean;
}

/**
 * The reasoning levels a user can choose, in order.
 *
 * Three, because that is what the surface offers and what the project state
 * stores. A model may name them differently, which is what `thinkingLevelMap`
 * is for — the level is the choice, the mapping is how it is said.
 */
export const THINKING_LEVELS = ["low", "medium", "high"] as const;

export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

/** Prices per million tokens, as the model publishes them. */
export interface ModelCostRates {
  readonly promptPerMTok: number;
  readonly completionPerMTok: number;
  readonly cacheReadPerMTok?: number;
  readonly cacheWritePerMTok?: number;
}

export interface CatalogProvider {
  readonly id: string;
  readonly label: string;
  /** Which request shape this provider speaks. */
  readonly runtime: RuntimeProvider;
  /**
   * Which endpoint kind this provider is reached through.
   *
   * Absent means the OpenAI-compatible shape, which is what every provider used
   * before a second kind existed. Separate from `runtime`, which names who
   * answers: the endpoint is how they want to be asked, and a provider that
   * offers both would need two entries rather than one entry with two shapes.
   *
   * A plain string rather than a union of the kinds that ship. The union was what
   * made a third protocol impossible to name: the registry could hold one, and
   * the catalogue had no way to say so, so a provider declaring it would have
   * been read as the default shape and sent a body its endpoint does not take.
   * An undeclared name reaches `endpointShape`, which refuses it by name instead
   * of guessing.
   */
  readonly endpoint?: EndpointKind;
  readonly auth: ProviderAuth;
  readonly baseUrl?: string;
  /** Environment variable conventionally holding the key. */
  readonly envVar?: string;
  readonly models: readonly CatalogModel[];
  /** True when the entry came from the user's own file rather than this snapshot. */
  readonly custom?: boolean;
}

const OPENAI_COMPATIBLE: RuntimeProvider = "openai-compatible";

/**
 * What a reasoning model on the OpenAI endpoint needs.
 *
 * Named once because every entry that needs it needs all of it: the ceiling
 * field and the instruction role changed together for the models that reason
 * before answering, and a request that carries one but not the other is still
 * rejected.
 */
const REASONING_REQUEST_SHAPE: ModelRequestShape = {
  systemRole: "developer",
  maxTokensField: "max_completion_tokens",
};

/** Providers that ship with the shell, in the order a chooser should offer them. */
export const BUILTIN_PROVIDERS: readonly CatalogProvider[] = [
  {
    id: "anthropic",
    label: "Anthropic",
    runtime: "anthropic",
    endpoint: "anthropic-messages",
    auth: "api-key",
    baseUrl: "https://api.anthropic.com/v1",
    envVar: "ANTHROPIC_API_KEY",
    models: [
      // Five minutes by default, an hour on the extended tier.
      { id: "claude-opus-4-6", contextWindow: 200_000, promptCache: { short: 300, long: 3_600 }, vision: true },
      { id: "claude-sonnet-4-5", contextWindow: 200_000, promptCache: { short: 300, long: 3_600 }, vision: true },
      { id: "claude-haiku-4-5", contextWindow: 200_000, promptCache: { short: 300, long: 3_600 }, vision: true },
    ],
  },
  {
    id: "openai",
    label: "OpenAI",
    runtime: "openai",
    auth: "api-key",
    envVar: "OPENAI_API_KEY",
    // The reasoning models reject `max_tokens` and the `system` role outright:
    // the request has to carry `max_completion_tokens` and address the
    // instruction to `developer`, or the call fails before it is answered. The
    // run-wide output ceiling is always sent, so without this every request to
    // one of these models was a rejected one.
    models: [
      // Five to ten minutes of inactivity, refreshed by each hit; the extended
      // tier runs to a day.
      { id: "gpt-5.3", contextWindow: 400_000, compat: REASONING_REQUEST_SHAPE, promptCache: { short: 600, long: 86_400 }, vision: true },
      { id: "gpt-5.3-codex", contextWindow: 400_000, compat: REASONING_REQUEST_SHAPE, promptCache: { short: 600, long: 86_400 } },
      { id: "gpt-5.1-mini", contextWindow: 400_000, compat: REASONING_REQUEST_SHAPE, promptCache: { short: 600, long: 86_400 }, vision: true },
      { id: "o4-mini", contextWindow: 200_000, compat: REASONING_REQUEST_SHAPE, vision: true },
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
      // Reasoning is a property of the model, not a dial: this endpoint does not
      // take a `reasoning_effort`, and sending one is a rejected request rather
      // than an ignored field. The other entry stays capable, because
      // `deepseek-chat` does accept the level.
      { id: "deepseek-reasoner", contextWindow: 128_000, reasoning: false },
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
/**
 * How a provider wants to be asked, when it says.
 *
 * Absent means the OpenAI-compatible shape, which is what every request looked
 * like before a second kind existed. Read from the catalogue rather than inferred
 * from the provider id: the id names who answers, and an endpoint is how they
 * want to be asked — the same company can offer both.
 *
 * The merged catalogue is read, not the built-in list, so a provider a user
 * added with its own endpoint is reached the way they declared it.
 */
export function providerEndpoint(
  catalog: readonly CatalogProvider[],
  provider: string,
): EndpointKind | undefined {
  // Passed through as declared, whatever it is. Mapping "anything that is not
  // this one kind" onto the default is what a closed union forced, and it read a
  // third protocol as the default shape — sending it a body its endpoint does not
  // accept, with nothing to say why. An unknown name now reaches `endpointShape`,
  // which names the kinds it does know.
  return catalog.find((candidate) => candidate.id === provider)?.endpoint;
}

/**
 * One model's entry, by provider first and then by id alone.
 *
 * The two-step lookup matches how a request is resolved elsewhere: a provider
 * that names the model answers first, and an id nobody claims is looked for
 * across the catalogue so a model configured without its provider still finds
 * its prices.
 *
 * An id two providers both claim is left unresolved. They may disagree about
 * what it costs and how long it stays cached, and picking one would attribute
 * the other's numbers to it.
 */
export function catalogModel(
  catalog: readonly CatalogProvider[],
  provider: string,
  model: string | undefined,
): CatalogModel | undefined {
  if (model === undefined) return undefined;
  const direct = catalog
    .find((candidate) => candidate.id === provider)
    ?.models.find((candidate) => candidate.id === model);
  if (direct !== undefined) return direct;
  const claims = catalog
    .map((candidate) => candidate.models.find((entry) => entry.id === model))
    .filter((entry): entry is CatalogModel => entry !== undefined);
  return claims.length === 1 ? claims[0] : undefined;
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
        // Carried, not defaulted: a provider a user added to talk to a second
        // protocol would otherwise be reached through the first one, and the
        // failure would look like a bad key rather than a wrong shape.
        endpoint: patch.endpoint,
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
      models: patch.models ? mergeModelEntries([...existing.models, ...patch.models]) : existing.models,
      custom: true,
    };
  }
  return merged;
}

/**
 * One entry per model id, later entries patching earlier ones field by field.
 *
 * A refresh snapshot carries what its publisher knows — an id, a context
 * window, a price — and says nothing about how the model wants a request
 * shaped. Replacing the entry outright therefore reads the snapshot's silence
 * as an instruction to forget, and a refresh that only meant to update a price
 * costs the model its `compat`, its `promptCache` and its `vision` declaration:
 * the system role reverts, the token ceiling field reverts, and a model that
 * accepts images stops being offered them.
 *
 * Merging keeps the shipped entry as the base and lets the later one win only
 * where it actually speaks. Fields are merged at the top level rather than
 * recursively, so a patch that declares `compat` replaces that whole object —
 * half of a request shape from each source would be a third shape neither
 * side declared.
 */
function mergeModelEntries(models: readonly CatalogModel[]): CatalogModel[] {
  const byId = new Map<string, CatalogModel>();
  for (const model of models) {
    const existing = byId.get(model.id);
    byId.set(model.id, existing ? { ...existing, ...withoutUndefined(model) } : model);
  }
  return [...byId.values()];
}

/** The model's own fields, with the absent ones left out so they cannot overwrite. */
function withoutUndefined(model: CatalogModel): Partial<CatalogModel> {
  return Object.fromEntries(
    Object.entries(model).filter(([, value]) => value !== undefined),
  ) as Partial<CatalogModel>;
}
