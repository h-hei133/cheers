import { describe, expect, it } from "vitest";
import { resolveProviderAuthContract } from "../auth/providerAuthRuntime.js";
import { providerFacts } from "../providers/facts.js";
import { isRuntimeProvider } from "../../config/runtimeConfig.js";
import { toSubscriptionAccountAuthConfig } from "../auth/providerAuthContract.js";
import { accountAuthFor } from "../../provider/request/authorization.js";

/**
 * A subscription sign-in is reachable from the command that starts one.
 *
 * The flows were written, unit-tested, and reachable from nothing: a credential
 * this build can issue but cannot be asked to issue is a credential a user never
 * gets. What makes one reachable is a contract registered under the provider the
 * command names, so that is what is asserted — through the same lookup the
 * command uses, not through the export.
 */
describe("a subscription sign-in", () => {
  for (const provider of ["github-copilot", "anthropic"] as const) {
    it(`can be started for ${provider}`, () => {
      expect(isRuntimeProvider(provider)).toBe(true);
      expect(resolveProviderAuthContract(provider)).toBeDefined();
    });

    it(`offers a method a surface can state for ${provider}`, () => {
      const contract = resolveProviderAuthContract(provider)!;
      expect(contract.methods.length).toBeGreaterThan(0);
      for (const method of contract.methods) {
        expect(method.label.trim().length, JSON.stringify(method)).toBeGreaterThan(0);
      }
    });

    it(`files its credential under the slot its declaration names for ${provider}`, () => {
      const facts = providerFacts(provider);
      expect(facts.accountAuthKey).toBe("subscription");
      expect(facts.accountAuthType).toBe(toSubscriptionAccountAuthConfig({
        accessToken: "t",
        refreshToken: "r",
        expiresAt: 0,
      }).type);
    });
  }

  /**
   * The code sign-in is offered as its own method.
   *
   * It exists for a machine that cannot open a browser, which is a different
   * situation from one that can — so a surface that only offered "sign in" would
   * send someone without a browser down a path that cannot finish.
   */
  it("is offered as a code method where the provider has one", () => {
    const methods = resolveProviderAuthContract("github-copilot")!.methods;

    expect(methods.some((method) => method.kind === "device-code")).toBe(true);
  });
});

describe("the credential a subscription sign-in produced", () => {
  /**
   * It is readable by the request path, not merely storable.
   *
   * Persisting a credential the request layer then refuses is the same as not
   * having signed in, and it fails later — at the first request — with a message
   * about authentication rather than about the sign-in.
   */
  it("is accepted for the provider it belongs to", () => {
    const stored = toSubscriptionAccountAuthConfig({
      accessToken: "session-token",
      refreshToken: "renew-token",
      expiresAt: Date.now() + 600_000,
    });

    expect(accountAuthFor("github-copilot", { accountAuth: stored })?.accessToken).toBe("session-token");
    expect(accountAuthFor("anthropic", { accountAuth: stored })?.accessToken).toBe("session-token");
  });

  it("is refused for a provider it does not belong to", () => {
    const stored = toSubscriptionAccountAuthConfig({
      accessToken: "session-token",
      refreshToken: "renew-token",
      expiresAt: Date.now() + 600_000,
    });

    // Otherwise one service's token would be sent to another.
    expect(accountAuthFor("openai", { accountAuth: stored })).toBeUndefined();
    expect(accountAuthFor("google", { accountAuth: stored })).toBeUndefined();
  });
});
