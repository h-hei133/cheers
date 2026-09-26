import { describe, expect, it } from "vitest";
import {
  declareEndpoint,
  declaredEndpointKinds,
  endpointBody,
  endpointKind,
  endpointShape,
  endpointText,
  endpointTurnBody,
  endpointUrl,
} from "./index.js";

/**
 * What is asserted here is the claim the consolidation exists to make: a new
 * protocol is a new module and nothing else. The stub below is registered from
 * this file, and every caller reaches it through the same registry the shipped
 * protocols go through — so if adding a protocol really did mean editing the
 * callers, these cases would still pass only by the callers having been edited,
 * which is what the file shows they were not.
 */

const STUB_KIND = "test-stub";

/**
 * Registered once for the file. The registry is module state and nothing
 * unregisters, so a per-case declaration would leave whichever ran last behind —
 * but the stub's kind is unique, so a single declaration is enough and stays
 * harmless.
 */
function declareStub(): void {
  declareEndpoint(STUB_KIND, {
    path: "/stub-resource",
    headers: (apiKey) => ({ "x-stub-key": apiKey }),
    body: (input) => ({ stub_model: input.model, stub_messages: input.messages }),
    // The full-turn body, which is what the main loop asks for. A protocol that
    // only answered the simpler question above would satisfy the registry and
    // still be unreachable from a real turn — which is exactly the hole this
    // stub exists to close.
    turnBody: (input) => ({
      stub_turn_model: input.model,
      stub_tool_count: input.tools.length,
      stub_system_role: input.systemRole,
      stub_max_tokens_field: input.maxTokensField,
    }),
    readBody: () => ({ choices: [{ message: { content: "from the stub" } }] }),
    // Never reached: these cases stop before a request is sent.
    readStream: () => {
      throw new Error("the stub does not stream");
    },
  });
}

declareStub();

describe("a declared protocol", () => {
  it("is reached by callers without any of them naming it", () => {
    // The three questions the callers actually ask, all answered for a protocol
    // none of them knows about.
    expect(endpointUrl("https://example.test/v1/", STUB_KIND)).toBe(
      "https://example.test/v1/stub-resource",
    );
    expect(endpointBody(STUB_KIND, { model: "m", messages: [] })).toEqual({
      stub_model: "m",
      stub_messages: [],
    });
    expect(endpointText(STUB_KIND, { anything: true })).toBe("from the stub");
    expect(endpointShape(STUB_KIND).headers("k")).toEqual({ "x-stub-key": "k" });
    // And the question the main turn asks, which used to be a branch in the turn
    // loop instead of a call into here.
    expect(
      endpointTurnBody(STUB_KIND, {
        model: "m",
        systemPrompt: "",
        messages: [],
        tools: [],
        allowTools: false,
        vision: false,
        temperature: 0.7,
        systemRole: "system",
        reasoningEffort: false,
        maxTokensField: "max_tokens",
        assistantAfterToolResult: false,
      }),
    ).toEqual({
      stub_turn_model: "m",
      stub_tool_count: 0,
      stub_system_role: "system",
      stub_max_tokens_field: "max_tokens",
    });
  });

  it("is listed among the kinds once declared", () => {
    expect(declaredEndpointKinds()).toContain(STUB_KIND);
  });
});

describe("the kinds that ship", () => {
  it("are declared, so an import of the index is enough to have them", () => {
    const kinds = declaredEndpointKinds();
    expect(kinds).toContain("openai-compatible");
    expect(kinds).toContain("anthropic-messages");
  });

  it("really disagree about the path, rather than both taking a default", () => {
    expect(endpointUrl("https://x.test", "openai-compatible")).toBe(
      "https://x.test/chat/completions",
    );
    expect(endpointUrl("https://x.test", "anthropic-messages")).toBe("https://x.test/messages");
  });

  it("send a credential differently, which is why headers are the protocol's business", () => {
    expect(endpointShape("openai-compatible").headers("k")).toEqual({ Authorization: "Bearer k" });
    expect(Object.keys(endpointShape("anthropic-messages").headers("k"))).not.toContain(
      "Authorization",
    );
  });
});

describe("an undeclared kind", () => {
  it("is an error rather than a silent default", () => {
    // Falling back would send the request in a shape the protocol does not speak,
    // and it would fail at the provider with a message about the payload.
    expect(() => endpointShape("not-a-protocol")).toThrow(/No endpoint declared/);
  });

  it("is what a model with no declared endpoint gets", () => {
    expect(endpointKind(undefined)).toBeUndefined();
    expect(endpointUrl("https://x.test", undefined)).toBe("https://x.test/chat/completions");
  });

  it("passes a configured name through unchanged, so a typo is not hidden", () => {
    // A configured value that names nothing is left as-is; the registry rejects
    // it by name rather than quietly pretending the default was meant.
    expect(endpointKind("typo-messages")).toBe("typo-messages");
    expect(() => endpointShape(endpointKind("typo-messages"))).toThrow(/typo-messages/);
  });

  it("treats an empty configured name as none at all", () => {
    expect(endpointKind("")).toBeUndefined();
  });
});

describe("a request with no tools", () => {
  it("omits a temperature the model is declared to reject", () => {
    // The same gate the full turn applies. A summarizer sends this shape, and a
    // caller that sets a temperature on a model that refuses one would otherwise
    // have no way to say so — the field was on the request and nothing read it.
    const body = endpointBody("openai-compatible", {
      model: "m",
      messages: [{ role: "user", content: "summarize" }],
      temperature: 0.7,
      supportsTemperature: false,
    });

    expect(body).not.toHaveProperty("temperature");
  });

  it("sends a temperature the model accepts", () => {
    const body = endpointBody("openai-compatible", {
      model: "m",
      messages: [{ role: "user", content: "summarize" }],
      temperature: 0.7,
    });

    expect(body.temperature).toBe(0.7);
  });
});
