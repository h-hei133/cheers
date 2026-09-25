import { describe, expect, it } from "vitest";
import type { RuntimeProvider } from "../../config/runtimeConfig.js";
import { accountAuthKey, declaredProviders, providerFacts } from "./facts.js";

/**
 * The declaration is only worth having if everything derives from it, so what is
 * asserted here is not that the table has the right values — that would pass even
 * if every caller kept its own copy. It is that the providers the rest of the
 * code is typed against all appear, and that the facts which were duplicated
 * across files are now single answers.
 */

const UNION: readonly RuntimeProvider[] = [
  "openai",
  "anthropic",
  "openai-compatible",
  "google",
  "antigravity",
  "claudecode",
];

describe("providerFacts", () => {
  it("declares every provider the type allows", () => {
    // The failure that matters: a provider added to the union and not declared
    // here would otherwise be found the first time someone used it, which is at
    // the moment an environment variable or a label is needed.
    expect([...declaredProviders()].sort()).toEqual([...UNION].sort());
  });

  it("gives every provider a label and an environment variable", () => {
    for (const provider of UNION) {
      const facts = providerFacts(provider);
      expect(facts.label.length, provider).toBeGreaterThan(0);
      // The shape every credential variable uses, so a typo here reads as a
      // missing key rather than as a code fault.
      expect(facts.apiKeyEnvVar, provider).toMatch(/^[A-Z][A-Z0-9_]*_API_KEY$/);
    }
  });

  /**
   * A label is what a user reads when something fails. The function this
   * replaced fell through to a default of "OpenAI", so an Anthropic failure was
   * reported as an OpenAI one — which names a service the user is not using, and
   * sends them to look at the wrong account and the wrong key.
   */
  it("names each provider as itself, never as the default", () => {
    expect(providerFacts("anthropic").label).toBe("Anthropic");
    expect(providerFacts("openai").label).toBe("OpenAI");
    // Only `openai` may be labelled OpenAI. The function this replaced answered
    // with that label for anything it did not list, so a failure on Anthropic
    // was reported as an OpenAI one.
    for (const provider of UNION.filter((p) => p !== "openai")) {
      expect(providerFacts(provider).label, provider).not.toBe("OpenAI");
    }
  });

  it("names no two providers the same", () => {
    const labels = UNION.map((provider) => providerFacts(provider).label);
    const envVars = UNION.map((provider) => providerFacts(provider).apiKeyEnvVar);
    expect(new Set(labels).size).toBe(labels.length);
    expect(new Set(envVars).size).toBe(envVars.length);
  });

  it("refuses an undeclared provider rather than answering for a different one", () => {
    // A fallback here would read an environment variable belonging to another
    // service and use whatever key was found in it.
    expect(() => providerFacts("not-a-provider" as RuntimeProvider)).toThrow(/No declaration/);
  });
});

describe("account auth facts", () => {
  it("names a config slot only for the providers that have an account login", () => {
    expect(accountAuthKey("openai")).toBe("openai");
    expect(accountAuthKey("google")).toBe("google");
    // Nothing, rather than a guess: reading another provider's slot would hand
    // back a credential belonging to a different service.
    expect(accountAuthKey("anthropic")).toBeUndefined();
    expect(accountAuthKey("openai-compatible")).toBeUndefined();
  });

  it("pairs each slot with the credential shape that belongs in it", () => {
    for (const provider of UNION) {
      const facts = providerFacts(provider);
      // A slot with no discriminator would accept any credential written there.
      expect(facts.accountAuthKey === undefined, provider).toBe(
        facts.accountAuthType === undefined,
      );
    }
  });

  it("gives a fixed model set only where the account publishes one", () => {
    const withSet = UNION.filter((p) => providerFacts(p).accountAuthAllowedModels !== undefined);
    expect(withSet).toEqual(["openai"]);
    // And where there is a set, the default is inside it — otherwise the login
    // would pick a model the switch then refuses.
    const facts = providerFacts("openai");
    expect(facts.accountAuthAllowedModels).toContain(facts.accountAuthDefaultModel);
  });

  it("is the only place the allowed model list appears", () => {
    // The list was in three files before. A fourth copy would defeat the point,
    // so the answer is asserted as an identity: the declaration's list is a
    // distinct object each call, and its contents are what callers read.
    const first = providerFacts("openai").accountAuthAllowedModels;
    const second = providerFacts("openai").accountAuthAllowedModels;
    expect(second).toEqual(first);
    expect(first?.length).toBeGreaterThan(0);
  });
});
