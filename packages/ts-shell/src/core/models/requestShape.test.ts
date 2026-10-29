import { describe, expect, it } from "vitest";
import { BUILTIN_PROVIDERS, mergeProviders, type CatalogProvider } from "./catalog.js";
import { DEFAULT_REQUEST_SHAPE, resolveRequestShape } from "./requestShape.js";

/**
 * The catalog said how big each model's window is and what it costs, but not how
 * to talk to it — so a model that refuses the `developer` role or that only takes
 * `max_completion_tokens` failed on an otherwise correct request. What is tested
 * here is that a declared shape reaches the request, and that an undeclared one
 * changes nothing.
 */

function catalogWith(model: Record<string, unknown>): readonly CatalogProvider[] {
  return [
    {
      id: "vendor",
      label: "Vendor",
      runtime: "openai-compatible",
      auth: "api-key",
      models: [{ id: "m", contextWindow: 128_000, ...model }],
    },
  ];
}

describe("resolveRequestShape", () => {
  it.each(['gemini-2.5-pro', 'gemini-2.5-flash'])('admits native %s summaries without setting effort or budget', model => {
    for (const [provider, address] of [
      ['google-ai', 'https://generativelanguage.googleapis.com/'],
      ['vertex', 'https://aiplatform.googleapis.com/v1/projects/synthetic-project/locations/global/publishers/google/models/'],
      ['vertex', 'https://us-central1-aiplatform.googleapis.com/v1/projects/123456/locations/us-central1/publishers/google/models'],
      ['vertex', 'https://europe-west4-aiplatform.googleapis.com:443/v1/projects/synthetic-project/locations/europe-west4/publishers/google/models'],
    ] as const) {
      const shape = resolveRequestShape(BUILTIN_PROVIDERS, provider, model, undefined, address);
      expect(shape.reasoningSummary).toBe(true);
      expect(shape.thinkingLevelName).toBeUndefined(); expect(shape.thinkingBudgetTokens).toBeUndefined();
    }
  });

  it('does not infer native summary support for compatible, account, unknown or anonymous Google targets', () => {
    for (const [provider, model, address, endpoint] of [
      ['google', 'gemini-2.5-pro', undefined, undefined],
      ['google-ai', 'gemini-3-pro', undefined, undefined],
      ['google-ai', 'unknown', undefined, undefined],
      ['google-ai', 'gemini-2.5-pro', 'https://generativelanguage.googleapis.com', 'google-account-generative-ai'],
      ['', 'gemini-2.5-pro', undefined, 'google-generative-ai'],
      ['openai', 'o4-mini', 'https://generativelanguage.googleapis.com', 'google-generative-ai'],
      ['google-ai', 'gemini-2.5-pro', 'https://api.openai.com/v1', 'openai-responses'],
    ] as const) {
      expect(resolveRequestShape(BUILTIN_PROVIDERS, provider, model, undefined, address, endpoint).reasoningSummary).toBeUndefined();
    }
  });

  it('keeps canonical Google summaries confined to the official native address', () => {
    for (const address of ['https://relay.invalid', 'http://generativelanguage.googleapis.com',
      'https://generativelanguage.googleapis.com.evil.invalid', 'https://generativelanguage.googleapis.com/v1beta',
      'https://generativelanguage.googleapis.com?route=1', 'https://generativelanguage.googleapis.com/#section',
      'https://synthetic@generativelanguage.googleapis.com', 'https://generativelanguage.googleapis.com:8443']) {
      expect(resolveRequestShape(BUILTIN_PROVIDERS, 'google-ai', 'gemini-2.5-pro', undefined, address).reasoningSummary).toBeUndefined();
    }
  });

  it('requires a captured Vertex resource whose hostname matches its location', () => {
    const path = '/v1/projects/synthetic-project/locations/global/publishers/google/models';
    for (const address of [undefined, 'not a URL', `http://aiplatform.googleapis.com${path}`,
      `https://aiplatform.googleapis.com:8443${path}`, `https://aiplatform.googleapis.com.evil.invalid${path}`,
      `https://synthetic@aiplatform.googleapis.com${path}`, `https://@aiplatform.googleapis.com${path}`,
      `https://aiplatform.googleapis.com${path}?route=1`, `https://aiplatform.googleapis.com${path}#section`,
      `https://aiplatform.googleapis.com${path}?`, `https://aiplatform.googleapis.com${path}#`,
      `https://global-aiplatform.googleapis.com${path}`, `https://us-central1-aiplatform.googleapis.com${path}`,
      `https://aiplatform.googleapis.com${path.replace('/global/', '/us-central1/')}`,
      `https://aiplatform.googleapis.com${path.replace('/synthetic-project/', '//')}`,
      `https://aiplatform.googleapis.com${path.replace('/global/', '//')}`,
      `https://aiplatform.googleapis.com${path.replace('/google/', '/foreign/')}`,
      `https://aiplatform.googleapis.com${path}/gemini-2.5-pro`,
      `https://aiplatform.googleapis.com${path.replace('/synthetic-project/', '/synthetic%2Fproject/')}`,
      `https://aiplatform.googleapis.com${path.replace('/synthetic-project/', '/synthetic/../synthetic-project/')}`]) {
      expect(resolveRequestShape(BUILTIN_PROVIDERS, 'vertex', 'gemini-2.5-pro', undefined, address).reasoningSummary).toBeUndefined();
    }
  });

  it.each([['google-ai', 'google-generative-ai'], ['vertex', 'google-vertex']] as const)(
    'retains %s summary refusal and admits only the exact relay alias declarations', (provider, endpoint) => {
    const address = 'https://relay.invalid/native';
    const models = [{ id: 'gemini-2.5-pro' }];
    const alias = mergeProviders(BUILTIN_PROVIDERS, [{ id: 'relay', runtime: provider, baseUrl: address, endpoint, models }]);
    expect(resolveRequestShape(alias, provider, 'gemini-2.5-pro', undefined, address).reasoningSummary).toBeUndefined();
    const admitted = mergeProviders(alias, [{ id: 'relay', models: [{ id: models[0]!.id, compat: { reasoningSummary: true } }] }]);
    expect(resolveRequestShape(admitted, provider, 'gemini-2.5-pro', undefined, address).reasoningSummary).toBe(true);
    expect(resolveRequestShape(admitted, provider, 'gemini-2.5-pro', undefined, 'https://other.invalid/native').reasoningSummary).toBeUndefined();
    const refused = mergeProviders(BUILTIN_PROVIDERS, [{ id: provider, models: [{ id: models[0]!.id, compat: { reasoningSummary: false } }] }]);
    const shape = resolveRequestShape(refused, provider, 'gemini-2.5-pro', 'high');
    expect(shape.reasoningSummary).toBe(false); expect(shape.thinkingBudgetTokens).toBe(16_384);
    expect(resolveRequestShape([...admitted, { ...admitted.at(-1)!, id: 'duplicate' }],
      provider, 'gemini-2.5-pro', undefined, address).reasoningSummary).toBeUndefined();
  });

  it('requests native visible summaries without selecting an effort or a budget', () => {
    const shape = resolveRequestShape(BUILTIN_PROVIDERS, 'openai', 'o4-mini', undefined, 'https://api.openai.com/v1/');
    expect(shape.reasoningSummary).toBe(true);
    expect(shape.thinkingLevelName).toBeUndefined(); expect(shape.thinkingBudgetTokens).toBeUndefined();
    expect(resolveRequestShape(BUILTIN_PROVIDERS, 'openai', 'o4-mini', undefined, 'https://relay.invalid/v1').reasoningSummary).toBeUndefined();
    expect(resolveRequestShape(BUILTIN_PROVIDERS, 'openai', 'o4-mini', undefined, 'https://relay.invalid/v1',
      'openai-responses').reasoningSummary).toBeUndefined();
    expect(resolveRequestShape(BUILTIN_PROVIDERS, 'openai', 'unlisted', undefined).reasoningSummary).toBeUndefined();
    expect(resolveRequestShape(BUILTIN_PROVIDERS, 'openai', 'gpt-5.3', undefined).reasoningSummary).toBeUndefined();
    expect(resolveRequestShape(BUILTIN_PROVIDERS, 'openai', 'gpt-5.3-codex', undefined).reasoningSummary).toBeUndefined();
    const relay = mergeProviders(BUILTIN_PROVIDERS, [{ id: 'relay', runtime: 'openai', baseUrl: 'https://api.openai.com/v1',
      models: [{ id: 'o4-mini', reasoning: true }] }]);
    expect(resolveRequestShape(relay, 'openai', 'o4-mini', undefined).reasoningSummary).toBeUndefined();
  });

  it('honors declared summary support separately from effort support and preserves refusal', () => {
    expect(resolveRequestShape(catalogWith({ compat: { reasoningSummary: true, reasoningEffort: false } }),
      'vendor', 'm', undefined, undefined, 'openai-responses').reasoningSummary).toBe(true);
    const refused = mergeProviders(BUILTIN_PROVIDERS, [{ id: 'openai', models: [{ id: 'o4-mini', compat: { reasoningSummary: false } }] }]);
    expect(resolveRequestShape(refused, 'openai', 'o4-mini', 'high').reasoningSummary).toBe(false);
    expect(resolveRequestShape(catalogWith({ reasoning: false, compat: { reasoningSummary: true } }),
      'vendor', 'm', 'high').reasoningSummary).toBe(false);
  });

  it('does not admit native summaries from unique model fallback without a provider owner', () => {
    const automatic = resolveRequestShape(BUILTIN_PROVIDERS, '', 'o4-mini', undefined, undefined, 'openai-responses');
    expect(automatic.reasoningSummary).toBeUndefined();
    const explicit = resolveRequestShape(BUILTIN_PROVIDERS, '', 'o4-mini', 'high', undefined, 'openai-responses');
    expect(explicit.reasoningSummary).toBeUndefined();
    expect(explicit.thinkingLevelName).toBe('high');
    expect(explicit.maxTokensField).toBe('max_completion_tokens');
  });

  it('admits known account summaries only with the issuer-resolved endpoint and exact account host', () => {
    const address = 'https://chatgpt.com/backend-api';
    expect(resolveRequestShape(BUILTIN_PROVIDERS, 'openai', 'o4-mini', undefined, address,
      'openai-account-responses').reasoningSummary).toBe(true);
    expect(resolveRequestShape(BUILTIN_PROVIDERS, 'openai', 'o4-mini', undefined, address).reasoningSummary).toBeUndefined();
    expect(resolveRequestShape(BUILTIN_PROVIDERS, 'openai', 'unlisted', undefined, address,
      'openai-account-responses').reasoningSummary).toBeUndefined();
    expect(resolveRequestShape(BUILTIN_PROVIDERS, 'openai', 'o4-mini', undefined, address,
      'openai-compatible').reasoningSummary).toBeUndefined();
    expect(resolveRequestShape(BUILTIN_PROVIDERS, 'openai', 'o4-mini', undefined, 'https://foreign.invalid',
      'openai-account-responses').reasoningSummary).toBeUndefined();
  });
  it("keeps what every request looked like before the catalog could answer", () => {
    const shape = resolveRequestShape(catalogWith({}), "vendor", "m", "high");
    expect(shape.systemRole).toBe("system");
    expect(shape.maxTokensField).toBe("max_tokens");
    expect(shape.assistantAfterToolResult).toBe(false);
  });

  it("falls back to the defaults for a model it does not know", () => {
    // With no level set, nothing distinguishes an unknown model from the shape
    // every request used before the catalog could answer.
    expect(resolveRequestShape([], "vendor", "unknown", undefined)).toEqual(DEFAULT_REQUEST_SHAPE);
    expect(resolveRequestShape(catalogWith({}), "vendor", undefined, undefined)).toEqual(DEFAULT_REQUEST_SHAPE);
  });

  it("still sends a level for a model it does not know", () => {
    // The setting worked before any model was described, and an undescribed
    // model is the normal case.
    const shape = resolveRequestShape([], "vendor", "unknown", "high");
    expect(shape.reasoningEffort).toBe(true);
    expect(shape.thinkingLevelName).toBe("high");
  });

  it("sends the system instruction in the role the model accepts", () => {
    const shape = resolveRequestShape(catalogWith({ compat: { systemRole: "developer" } }), "vendor", "m", undefined);
    expect(shape.systemRole).toBe("developer");
  });

  it("names the output ceiling the way the model expects", () => {
    const shape = resolveRequestShape(
      catalogWith({ compat: { maxTokensField: "max_completion_tokens" } }),
      "vendor",
      "m",
      undefined,
    );
    expect(shape.maxTokensField).toBe("max_completion_tokens");
  });

  it("bridges tool results for a model that requires it", () => {
    const shape = resolveRequestShape(
      catalogWith({ compat: { assistantAfterToolResult: true } }),
      "vendor",
      "m",
      undefined,
    );
    expect(shape.assistantAfterToolResult).toBe(true);
  });

  it("reports the model's own output ceiling", () => {
    // The ceiling is a property of the model, so the catalog is where it lives.
    // It is what the request falls back to when the run set no ceiling of its own.
    const shape = resolveRequestShape(catalogWith({ maxTokens: 16_384 }), "vendor", "m", undefined);
    expect(shape.maxOutputCeiling).toBe(16_384);
  });

  it("leaves the ceiling to the request when the model declares none", () => {
    expect(resolveRequestShape(catalogWith({}), "vendor", "m", undefined).maxOutputCeiling).toBeUndefined();
  });

  it("still sends a level for a model the snapshot does not describe", () => {
    // Defaulting this the other way would silently disable a setting that works
    // for every model not listed, which is all of them today.
    const shape = resolveRequestShape(catalogWith({}), "vendor", "m", "high");
    expect(shape.reasoningEffort).toBe(true);
    expect(shape.thinkingLevelName).toBe("high");
  });

  it("stops sending a level for a model known to reject it", () => {
    const shape = resolveRequestShape(catalogWith({ reasoning: false }), "vendor", "m", "high");
    expect(shape.reasoningEffort).toBe(false);
    expect(shape.thinkingLevelName).toBeUndefined();
  });

  it("stops sending a level when the model refuses the field", () => {
    const shape = resolveRequestShape(
      catalogWith({ compat: { reasoningEffort: false } }),
      "vendor",
      "m",
      "high",
    );
    expect(shape.reasoningEffort).toBe(false);
  });

  it("sends nothing when no level is set", () => {
    expect(resolveRequestShape(catalogWith({}), "vendor", "m", undefined).thinkingLevelName).toBeUndefined();
  });

  it("keeps tool calling capable by default and honors an explicit refusal", () => {
    expect(resolveRequestShape(catalogWith({}), "vendor", "m", undefined).toolCalling).toBe(true);
    expect(resolveRequestShape(catalogWith({ toolCalling: false }), "vendor", "m", undefined).toolCalling).toBe(false);
  });

  it("uses the model's own name for a level", () => {
    const shape = resolveRequestShape(
      catalogWith({ thinkingLevelMap: { high: "xhigh" } }),
      "vendor",
      "m",
      "high",
    );
    expect(shape.thinkingLevelName).toBe("xhigh");
  });

  it("falls back to a level the model does have", () => {
    // A level is a preference. Refusing to send anything would turn "think a
    // little less" into "do not think".
    const shape = resolveRequestShape(
      catalogWith({ thinkingLevelMap: { low: null, medium: null } }),
      "vendor",
      "m",
      "low",
    );
    expect(shape.thinkingLevelName).toBe("high");
  });

  it("uses the level's own name when the model mapped only other levels", () => {
    // `medium` is unmapped, so it travels as `medium` — the endpoints that use
    // these names are the common case, and a model that mapped only its
    // neighbours still understands the standard spelling.
    const shape = resolveRequestShape(
      catalogWith({ thinkingLevelMap: { low: "brief", high: "thorough" } }),
      "vendor",
      "m",
      "medium",
    );
    expect(shape.thinkingLevelName).toBe("medium");
  });

  it("takes a lower level rather than a higher one when its own is unavailable", () => {
    // Downward, not upward: a model asked for less reasoning answers faster,
    // while one asked for more can spend a long time before saying anything.
    const shape = resolveRequestShape(
      catalogWith({ thinkingLevelMap: { medium: null, low: "brief", high: "thorough" } }),
      "vendor",
      "m",
      "medium",
    );
    expect(shape.thinkingLevelName).toBe("brief");
  });

  it("takes a higher level when nothing lower is available", () => {
    const shape = resolveRequestShape(
      catalogWith({ thinkingLevelMap: { medium: null, low: null } }),
      "vendor",
      "m",
      "medium",
    );
    expect(shape.thinkingLevelName).toBe("high");
  });

  it("prefers the provider's entry when two providers serve the same id", () => {
    const catalog: readonly CatalogProvider[] = [
      {
        id: "a",
        label: "A",
        runtime: "openai-compatible",
        auth: "api-key",
        models: [{ id: "shared", contextWindow: 1_000, compat: { systemRole: "developer" } }],
      },
      {
        id: "b",
        label: "B",
        runtime: "openai-compatible",
        auth: "api-key",
        models: [{ id: "shared", contextWindow: 2_000, compat: { systemRole: "system" } }],
      },
    ];
    expect(resolveRequestShape(catalog, "b", "shared", undefined).systemRole).toBe("system");
    expect(resolveRequestShape(catalog, "a", "shared", undefined).systemRole).toBe("developer");
  });

  it("leaves an ambiguous id unresolved rather than guessing", () => {
    // Two providers serving the same id may disagree about how to talk to it.
    const catalog: readonly CatalogProvider[] = [
      {
        id: "a",
        label: "A",
        runtime: "openai-compatible",
        auth: "api-key",
        models: [{ id: "shared", contextWindow: 1_000, compat: { systemRole: "developer" } }],
      },
      {
        id: "b",
        label: "B",
        runtime: "openai-compatible",
        auth: "api-key",
        models: [{ id: "shared", contextWindow: 2_000, compat: { systemRole: "developer" } }],
      },
    ];
    expect(resolveRequestShape(catalog, "c", "shared", undefined)).toEqual(DEFAULT_REQUEST_SHAPE);
  });
});
