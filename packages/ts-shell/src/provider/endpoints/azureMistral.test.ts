import { afterEach, describe, expect, it } from "vitest";
import { declaredEndpointKinds, endpointShape, endpointTurnBody, endpointUrl, type TurnRequest } from "./index.js";
import { normalizeMistralToolCallId } from "./mistral.js";
import { BUILTIN_PROVIDERS, mergeProviders, providerEndpoint } from "../../core/models/catalog.js";

const originalAzureVersion = process.env.AZURE_OPENAI_API_VERSION;

afterEach(() => {
  if (originalAzureVersion === undefined) delete process.env.AZURE_OPENAI_API_VERSION;
  else process.env.AZURE_OPENAI_API_VERSION = originalAzureVersion;
});

describe("azure-openai-responses endpoint", () => {
  it("addresses deployment models in the Responses body with api-key authentication", () => {
    expect(declaredEndpointKinds()).toContain("azure-openai-responses");
    delete process.env.AZURE_OPENAI_API_VERSION;
    expect(endpointUrl("https://my-res.openai.azure.com", "azure-openai-responses", "gpt-4o/dev")).toBe(
      "https://my-res.openai.azure.com/openai/v1/responses?api-version=v1",
    );
    expect(() => endpointUrl("https://my-res.openai.azure.com", "azure-openai-responses", "..")).toThrow(
      /Invalid Azure OpenAI deployment/,
    );
    const headers = endpointShape("azure-openai-responses").headers("secret-key");
    expect(headers["api-key"]).toBe("secret-key");
    expect(headers.Authorization).toBeUndefined();
    expect(endpointShape("azure-openai-responses").body({
      model: "gpt-4o/dev", systemPrompt: "", messages: [{ role: "user", content: "hello" }],
    })).toMatchObject({ model: "gpt-4o/dev" });
  });

  it.each([
    "https://my-res.openai.azure.com",
    "https://my-res.cognitiveservices.azure.com/openai/",
    "https://my-res.services.ai.azure.com/openai/v1",
    "https://my-res.openai.azure.com/openai/v1/responses",
    "https://my-res.openai.azure.com/openai/v1/responses/",
  ])("normalizes the configured Azure base once: %s", (base) => {
    delete process.env.AZURE_OPENAI_API_VERSION;
    const url = new URL(endpointUrl(base, "azure-openai-responses", "deployment"));
    expect(url.pathname).toBe("/openai/v1/responses");
    expect(url.searchParams.get("api-version")).toBe("v1");
  });

  it("preserves proxy prefixes and configured queries while avoiding duplicated resources", () => {
    process.env.AZURE_OPENAI_API_VERSION = "2025-04-01-preview";
    expect(endpointUrl("https://my-res.openai.azure.com", "azure-openai-responses", "deployment")).toBe(
      "https://my-res.openai.azure.com/openai/responses?api-version=2025-04-01-preview",
    );
    expect(endpointUrl("https://relay.test/azure/openai/v1/?route=team&api-version=v1#display", "azure-openai-responses", "deployment")).toBe(
      "https://relay.test/azure/openai/v1/responses?route=team&api-version=v1",
    );
    expect(endpointUrl("https://relay.test/azure/responses?route=team", "azure-openai-responses", "deployment")).toBe(
      "https://relay.test/azure/responses?route=team&api-version=2025-04-01-preview",
    );
    expect(() => endpointUrl("file:///tmp/private", "azure-openai-responses", "deployment")).toThrow(/endpoint protocol/);
  });
});

describe("mistral-chat-completions endpoint", () => {
  it("routes the shipped catalog and exact relay declarations through the selected protocol", () => {
    const endpoint = providerEndpoint(BUILTIN_PROVIDERS, "mistral");
    expect(endpoint).toBe("mistral-chat-completions");
    const shipped = BUILTIN_PROVIDERS.find(provider => provider.id === "mistral")!;
    expect(providerEndpoint(BUILTIN_PROVIDERS, shipped.runtime, shipped.baseUrl)).toBe(endpoint);
    expect(endpointUrl(shipped.baseUrl!, endpoint, shipped.models[0]!.id)).toBe("https://api.mistral.ai/v1/chat/completions");
    expect(endpointShape("mistral-conversations")).toBe(endpointShape(endpoint));

    const catalog = mergeProviders(BUILTIN_PROVIDERS, [
      { id: "mistral", endpoint: "openai-compatible" },
      { id: "team-relay", runtime: shipped.runtime, baseUrl: "https://relay.test/v1", endpoint: "mistral-chat-completions" },
    ]);
    expect(providerEndpoint(catalog, "mistral")).toBe("openai-compatible");
    expect(providerEndpoint(catalog, shipped.runtime, "https://relay.test/v1")).toBe("mistral-chat-completions");
  });

  it("deterministically normalizes tool call IDs without prefix collisions and forwards sanitized x-affinity", () => {
    const endpoint = providerEndpoint(BUILTIN_PROVIDERS, "mistral");

    // Valid 9-char alphanumeric IDs are kept verbatim.
    expect(normalizeMistralToolCallId("AbCd12345")).toBe("AbCd12345");

    // Distinct IDs sharing prefixes remain distinct and match ^[a-zA-Z0-9]{9}$.
    const id0 = normalizeMistralToolCallId("call_stream_0");
    const id1 = normalizeMistralToolCallId("call_stream_1");
    expect(id0).toMatch(/^[a-zA-Z0-9]{9}$/);
    expect(id1).toMatch(/^[a-zA-Z0-9]{9}$/);
    expect(id0).not.toBe(id1);

    const turn: TurnRequest = {
      model: "mistral-large-latest",
      provider: "mistral",
      systemPrompt: "sys",
      messages: [
        {
          role: "assistant" as const,
          content: "",
          tool_calls: [{ id: "call_123-456-789", type: "function" as const, function: { name: "read", arguments: "{}" } }],
        },
        {
          role: "tool" as const,
          tool_call_id: "call_123-456-789",
          content: "ok",
        },
      ],
      tools: [],
      allowTools: false,
      vision: false,
      assistantAfterToolResult: false,
      systemRole: "system" as const,
      maxTokensField: "max_tokens" as const,
      supportsTemperature: true,
      temperature: 0.7,
      reasoningEffort: false,
      sessionId: "sess-mistral-1\r\nInjected: bad",
    };

    const body = endpointTurnBody(endpoint, turn) as {
      messages: Array<{ tool_call_id?: string; tool_calls?: Array<{ id: string }> }>;
      prompt_cache_key?: string;
      stream_options?: unknown;
      prompt_cache_retention?: string;
    };
    const expectedId = normalizeMistralToolCallId("call_123-456-789");
    expect(body.messages[1].tool_calls?.[0].id).toBe(expectedId);
    expect(body.messages[2].tool_call_id).toBe(expectedId);
    expect(body.prompt_cache_key).toBe("sess-mistral-1Injected: bad");
    expect(body.stream_options).toBeUndefined();
    expect(body.prompt_cache_retention).toBeUndefined();
    expect(endpointShape(endpoint).refreshBody?.({ ...body, max_tokens: 2048 }, {})).toMatchObject({ max_tokens: 1 });
    expect(endpointShape(endpoint).requestHeaders?.(turn)).toEqual({
      "x-affinity": "sess-mistral-1Injected: bad",
    });
    expect(endpointShape(endpoint).requestHeaders?.({ ...turn, cacheRetention: "none" })).toEqual({});
    expect(endpointTurnBody(endpoint, { ...turn, cacheRetention: "none" })).not.toHaveProperty("prompt_cache_key");
    const simple = endpointShape(endpoint).body({
      model: turn.model, messages: turn.messages, sessionId: turn.sessionId, cacheRetention: "long",
    });
    const simpleMessages = simple.messages as Array<{ tool_call_id?: string; tool_calls?: Array<{ id: string }> }>;
    expect(simpleMessages[0].tool_calls?.[0].id).toBe(expectedId);
    expect(simpleMessages[1].tool_call_id).toBe(expectedId);
    expect(simple.prompt_cache_key).toBe("sess-mistral-1Injected: bad");
    expect(simple).not.toHaveProperty("prompt_cache_retention");
  });
});
