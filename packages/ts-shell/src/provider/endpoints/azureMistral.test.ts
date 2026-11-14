import { afterEach, describe, expect, it } from "vitest";
import { declaredEndpointKinds, endpointShape, endpointTurnBody, endpointUrl } from "./index.js";
import { normalizeMistralToolCallId } from "./mistral.js";

const originalAzureVersion = process.env.AZURE_OPENAI_API_VERSION;

afterEach(() => {
  if (originalAzureVersion === undefined) delete process.env.AZURE_OPENAI_API_VERSION;
  else process.env.AZURE_OPENAI_API_VERSION = originalAzureVersion;
});

describe("azure-openai-responses endpoint", () => {
  it("is declared, builds Azure deployment URLs with api-key header, and rejects dot segments", () => {
    expect(declaredEndpointKinds()).toContain("azure-openai-responses");
    process.env.AZURE_OPENAI_API_VERSION = "2025-05-01";
    expect(endpointUrl("https://my-res.openai.azure.com", "azure-openai-responses", "gpt-4o/dev")).toBe(
      "https://my-res.openai.azure.com/openai/deployments/gpt-4o%2Fdev/responses?api-version=2025-05-01",
    );
    expect(() => endpointUrl("https://my-res.openai.azure.com", "azure-openai-responses", "..")).toThrow(
      /Invalid Azure OpenAI deployment/,
    );
    const headers = endpointShape("azure-openai-responses").headers("secret-key");
    expect(headers["api-key"]).toBe("secret-key");
    expect(headers.Authorization).toBeUndefined();
  });
});

describe("mistral-conversations endpoint", () => {
  it("deterministically normalizes tool call IDs without prefix collisions and forwards sanitized x-affinity", () => {
    expect(declaredEndpointKinds()).toContain("mistral-conversations");

    // Valid 9-char alphanumeric IDs are kept verbatim.
    expect(normalizeMistralToolCallId("AbCd12345")).toBe("AbCd12345");

    // Distinct IDs sharing prefixes remain distinct and match ^[a-zA-Z0-9]{9}$.
    const id0 = normalizeMistralToolCallId("call_stream_0");
    const id1 = normalizeMistralToolCallId("call_stream_1");
    expect(id0).toMatch(/^[a-zA-Z0-9]{9}$/);
    expect(id1).toMatch(/^[a-zA-Z0-9]{9}$/);
    expect(id0).not.toBe(id1);

    const turn = {
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
      temperature: undefined,
      reasoningEffort: undefined,
      sessionId: "sess-mistral-1\r\nInjected: bad",
    };

    const body = endpointTurnBody("mistral-conversations", turn) as {
      messages: Array<{ tool_call_id?: string; tool_calls?: Array<{ id: string }> }>;
      promptCacheKey?: string;
    };
    const expectedId = normalizeMistralToolCallId("call_123-456-789");
    expect(body.messages[1].tool_calls?.[0].id).toBe(expectedId);
    expect(body.messages[2].tool_call_id).toBe(expectedId);
    expect(body.promptCacheKey).toBeUndefined();
    expect(endpointShape("mistral-conversations").requestHeaders?.(turn)).toEqual({
      "x-affinity": "sess-mistral-1Injected: bad",
    });
    expect(endpointShape("mistral-conversations").requestHeaders?.({ ...turn, cacheRetention: "none" })).toEqual({});
  });
});
