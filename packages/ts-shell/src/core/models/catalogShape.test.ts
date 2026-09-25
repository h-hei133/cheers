import { describe, expect, it } from "vitest";
import { BUILTIN_PROVIDERS, mergeProviders, providerEndpoint } from "./catalog.js";
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
});
