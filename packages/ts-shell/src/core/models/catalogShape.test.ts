import { describe, expect, it } from "vitest";
import { BUILTIN_PROVIDERS, catalogModel, mergeProviders, providerEndpoint } from "./catalog.js";
import { resolveRequestShape } from "./requestShape.js";

/**
 * What the models the shell ships with actually send.
 *
 * The request shape was wired through and then every shipped entry was left
 * undeclared, so the feature did nothing for the only models a user is offered
 * out of the box. These assert the wire values for the entries where the wrong
 * one is a rejected request rather than a cosmetic difference — which is exactly
 * the kind of gap a test that only exercises a hand-built catalog cannot see.
 */

function shapeFor(providerId: string, modelId: string, level: "low" | "medium" | "high" | undefined = undefined) {
  return resolveRequestShape(BUILTIN_PROVIDERS, providerId, modelId, level);
}

describe("the shipped catalog", () => {
  it("names the output ceiling the way OpenAI's reasoning models require", () => {
    // These reject `max_tokens`, and the run-wide ceiling is always sent, so
    // without this every request to one of them failed before being answered.
    for (const modelId of ["gpt-5.3", "gpt-5.3-codex", "gpt-5.1-mini", "o4-mini"]) {
      expect(shapeFor("openai", modelId).maxTokensField).toBe("max_completion_tokens");
    }
  });

  it("addresses the instruction to the role OpenAI's reasoning models require", () => {
    for (const modelId of ["gpt-5.3", "o4-mini"]) {
      expect(shapeFor("openai", modelId).systemRole).toBe("developer");
    }
  });

  it("does not send temperature to OpenAI reasoning models at automatic effort", () => {
    for (const modelId of ["gpt-5.3", "gpt-5.3-codex", "gpt-5.1-mini", "o4-mini"]) {
      expect(shapeFor("openai", modelId).supportsTemperature).toBe(false);
    }
  });

  it("lets a user override capabilities a refreshed cache may not", () => {
    const refreshed = mergeProviders(BUILTIN_PROVIDERS, [{
      id: "openai",
      models: [{
        id: "gpt-5.3-codex",
        reasoning: false,
        vision: true,
        compat: { supportsTemperature: true },
      }],
    }], { preserveExplicitCapabilities: true, origin: "refresh" });
    expect(resolveRequestShape(refreshed, "openai", "gpt-5.3-codex")).toMatchObject({
      reasoningEffort: true,
      vision: false,
      supportsTemperature: false,
    });

    const user = mergeProviders(refreshed, [{
      id: "openai",
      models: [{
        id: "gpt-5.3-codex",
        reasoning: false,
        vision: true,
        compat: { supportsTemperature: true },
      }],
    }]);
    expect(resolveRequestShape(user, "openai", "gpt-5.3-codex")).toMatchObject({
      reasoningEffort: false,
      vision: true,
      supportsTemperature: true,
    });
  });

  it("keeps reviewed thinking levels over refreshed metadata", () => {
    const reviewed = [{
      id: "vendor",
      label: "Vendor",
      runtime: "openai-compatible" as const,
      auth: "api-key" as const,
      models: [{
        id: "reasoning",
        reasoning: true,
        thinkingLevelMap: { low: "brief", medium: null, high: "thorough" },
      }],
    }];
    const refreshed = mergeProviders(reviewed, [{
      id: "vendor",
      models: [{
        id: "reasoning",
        thinkingLevelMap: { low: null, medium: "medium", high: null },
      }],
    }], { preserveExplicitCapabilities: true, origin: "refresh" });
    expect(catalogModel(refreshed, "vendor", "reasoning")?.thinkingLevelMap).toEqual({
      low: "brief",
      medium: null,
      high: "thorough",
    });
  });

  it("stops sending a level to the model that refuses the field", () => {
    // `deepseek-reasoner` reasons by construction and rejects `reasoning_effort`.
    expect(shapeFor("deepseek", "deepseek-reasoner", "high").reasoningEffort).toBe(false);
    expect(shapeFor("deepseek", "deepseek-reasoner", "high").thinkingLevelName).toBeUndefined();
  });

  it("leaves the other endpoints on the shape they already accepted", () => {
    // The change had to be additive: an entry nobody declared keeps sending what
    // it sent before, or a working connection breaks to fix a broken one.
    expect(shapeFor("anthropic", "claude-opus-4-6", "high").systemRole).toBe("system");
    expect(shapeFor("anthropic", "claude-opus-4-6", "high").maxTokensField).toBe("max_tokens");
    expect(shapeFor("anthropic", "claude-opus-4-6", "high").thinkingLevelName).toBe("high");
    expect(shapeFor("deepseek", "deepseek-chat", "high").reasoningEffort).toBe(true);
  });

  it("describes every model it ships", () => {
    // A shipped entry with no shape is the gap this file exists for: it is the
    // model a user is most likely to be running.
    const openai = BUILTIN_PROVIDERS.find((provider) => provider.id === "openai");
    expect(openai).toBeDefined();
    for (const model of openai?.models ?? []) {
      expect(model.compat).toBeDefined();
    }
  });

  it("reads the endpoint kind a provider declares", () => {
    // The endpoint is a property of the provider, so it is read from the
    // catalogue rather than inferred from the provider id.
    expect(providerEndpoint(BUILTIN_PROVIDERS, "anthropic")).toBe("anthropic-messages");
    // Absent means the OpenAI-compatible shape every request had before a
    // second kind existed.
    expect(providerEndpoint(BUILTIN_PROVIDERS, "openai")).toBeUndefined();
  });

  it("keeps the endpoint kind a user declares for their own provider", () => {
    // A provider added to reach a second protocol must be reached that way. If
    // the merge drops this, the request goes out in the first protocol's shape
    // and fails as though the key were wrong.
    const merged = mergeProviders(BUILTIN_PROVIDERS, [
      { id: "my-proxy", endpoint: "anthropic-messages", baseUrl: "https://proxy.test/v1" },
    ]);
    expect(providerEndpoint(merged, "my-proxy")).toBe("anthropic-messages");
  });

  it("does not invent an endpoint for a provider that declares none", () => {
    const merged = mergeProviders(BUILTIN_PROVIDERS, [{ id: "plain", baseUrl: "https://plain.test/v1" }]);
    expect(providerEndpoint(merged, "plain")).toBeUndefined();
  });
  it("treats an undeclared model as unable to read an image", () => {
    // The default has to be the safe side. Sending an image to a model that
    // cannot read one fails the whole request, which loses the text the user
    // wrote alongside it; describing the image loses only what the model could
    // not have used.
    const shape = resolveRequestShape(BUILTIN_PROVIDERS, "openai", "a-model-nobody-described");
    expect(shape.vision).toBe(false);
  });

  it("reports vision for the models that declare it", () => {
    // Declared per model rather than guessed from the name, so a model that
    // accepts images is not refused for looking unlike a pattern.
    expect(resolveRequestShape(BUILTIN_PROVIDERS, "anthropic", "claude-sonnet-4-5").vision).toBe(true);
    expect(resolveRequestShape(BUILTIN_PROVIDERS, "openai", "gpt-5.3").vision).toBe(true);
    // And one that does not declare it stays false, which is a decision rather
    // than an omission: this model is not sent images.
    expect(resolveRequestShape(BUILTIN_PROVIDERS, "openai", "gpt-5.3-codex").vision).toBe(false);
  });

  it("keeps a model's declared shape when a refresh patches it", () => {
    // A refresh snapshot knows prices and context windows, not request shapes.
    // Reading its silence as "forget what you knew" reverted the system role and
    // the token field, so a model that had been fixed went back to the request
    // its endpoint rejects — silently, since the catalog still answered.
    const before = shapeFor("openai", "gpt-5.3");
    expect(before.systemRole).toBe("developer");
    expect(before.maxTokensField).toBe("max_completion_tokens");

    const merged = mergeProviders(BUILTIN_PROVIDERS, [
      {
        id: "openai",
        models: [{ id: "gpt-5.3", contextWindow: 400_000 }],
      },
    ]);

    expect(resolveRequestShape(merged, "openai", "gpt-5.3")).toEqual(before);
    expect(catalogModel(merged, "openai", "gpt-5.3")?.contextWindow).toBe(400_000);
  });

  it("keeps a model's vision declaration when a refresh patches it", () => {
    const merged = mergeProviders(BUILTIN_PROVIDERS, [
      { id: "anthropic", models: [{ id: "claude-sonnet-4-5", contextWindow: 500_000 }] },
    ]);
    expect(resolveRequestShape(merged, "anthropic", "claude-sonnet-4-5").vision).toBe(true);
  });

  it("merges a patch into a shape field by field rather than replacing the shape", () => {
    // A patch that speaks about one flag is speaking about that flag. Merging
    // the shape whole read it as an instruction to forget the rest, so a user
    // who set one flag on a reasoning model silently got the request shape the
    // shipped entry existed to correct — the developer role reverted, and the
    // request went out in a form the endpoint rejects.
    const merged = mergeProviders(BUILTIN_PROVIDERS, [
      { id: "openai", models: [{ id: "gpt-5.3", compat: { allowEmptySignature: true } }] },
    ]);
    const shape = resolveRequestShape(merged, "openai", "gpt-5.3");
    expect(shape.allowEmptySignature).toBe(true);
    expect(shape.systemRole).toBe("developer");
    expect(shape.maxTokensField).toBe("max_completion_tokens");
  });

  it("still lets a patch change a flag the shape already declared", () => {
    const merged = mergeProviders(BUILTIN_PROVIDERS, [
      { id: "openai", models: [{ id: "gpt-5.3", compat: { systemRole: "system" } }] },
    ]);
    expect(resolveRequestShape(merged, "openai", "gpt-5.3").systemRole).toBe("system");
  });

  it("still lets a user's model override a shipped one", () => {
    // The merge must not make shipped entries win: a user who describes a model
    // differently means it.
    const merged = mergeProviders(BUILTIN_PROVIDERS, [
      { id: "openai", models: [{ id: "gpt-5.3", vision: false }] },
    ]);
    expect(resolveRequestShape(merged, "openai", "gpt-5.3").vision).toBe(false);
  });

  it("adds a model the catalog did not have", () => {
    const merged = mergeProviders(BUILTIN_PROVIDERS, [
      { id: "openai", models: [{ id: "gpt-9-preview", contextWindow: 1_000_000 }] },
    ]);
    expect(catalogModel(merged, "openai", "gpt-9-preview")?.contextWindow).toBe(1_000_000);
  });
});
