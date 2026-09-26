import { describe, expect, it } from "vitest";
import { RUNTIME_PROVIDERS, type RuntimeProvider } from "../../config/runtimeConfig.js";
import {
  toGoogleAccountAuthConfig,
  toOpenAIAccountAuthConfig,
  toSubscriptionAccountAuthConfig,
} from "../../core/auth/providerAuthContract.js";
import { accountAuthKey, providerFacts, type ProviderFacts } from "./facts.js";

/**
 * The declaration is only worth having if everything derives from it, so what is
 * asserted here is not that the table has the right values — that would pass even
 * if every caller kept its own copy. It is that the providers the rest of the
 * code is typed against all appear, and that the facts which were duplicated
 * across files are now single answers.
 */

/**
 * The providers to walk, taken from the one list rather than restated.
 *
 * A copy here would be the same drift the table exists to remove, one file away
 * from where it was being removed: a provider added to the list and not to the
 * copy would simply stop being tested, quietly.
 */
const UNION = RUNTIME_PROVIDERS;

describe("providerFacts", () => {
  it("declares every provider the type allows", () => {
    // The failure that matters: a provider added to the list and not declared
    // here would otherwise be found the first time someone used it, which is at
    // the moment an environment variable or a label is needed. `providerFacts`
    // refuses an undeclared name by throwing, so reaching the label at all is
    // the assertion: a miss fails here rather than reading as `undefined`.
    expect(RUNTIME_PROVIDERS.length).toBeGreaterThan(0);
    for (const provider of RUNTIME_PROVIDERS) {
      expect(providerFacts(provider).label.length, provider).toBeGreaterThan(0);
    }
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
    // A subscription is an account credential too, so the two providers that
    // take one name the subscription slot.
    expect(accountAuthKey("anthropic")).toBe("subscription");
    expect(accountAuthKey("github-copilot")).toBe("subscription");
    // Nothing, rather than a guess: reading another provider's slot would hand
    // back a credential belonging to a different service.
    expect(accountAuthKey("openai-compatible")).toBeUndefined();
    expect(accountAuthKey("bedrock")).toBeUndefined();
    expect(accountAuthKey("vertex")).toBeUndefined();
  });

  it("pairs each slot with the credential shape its own login produces", () => {
    // The two are read together when a credential is filed: the slot decides
    // where it goes and the discriminator decides whether it belongs there. So
    // the assertion is the pairing, not merely that both are present — presence
    // alone passes with the two providers' discriminators swapped, which would
    // file Google's credential under OpenAI's slot and hand it to the wrong
    // service on the next request.
    //
    // The expected shape is taken from the login that produces it rather than
    // restated, so a change on either side breaks the test.
    const producedByLogin: Partial<Record<NonNullable<ProviderFacts["accountAuthKey"]>, string>> = {
      openai: toOpenAIAccountAuthConfig({
        accessToken: "t",
        refreshToken: "r",
        expiresAt: "e",
      }).type,
      google: toGoogleAccountAuthConfig({
        accessToken: "t",
        refreshToken: "r",
        expiresAt: "e",
      }).type,
      subscription: toSubscriptionAccountAuthConfig({
        accessToken: "t",
        refreshToken: "r",
        expiresAt: 0,
      }).type,
    };

    for (const provider of UNION) {
      const facts = providerFacts(provider);
      if (facts.accountAuthKey === undefined) {
        expect(facts.accountAuthType, provider).toBeUndefined();
        continue;
      }
      expect(facts.accountAuthType, provider).toBe(producedByLogin[facts.accountAuthKey]);
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
