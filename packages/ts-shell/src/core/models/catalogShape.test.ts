import { describe, expect, it } from "vitest";
import { BUILTIN_PROVIDERS } from "./catalog.js";
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
});
