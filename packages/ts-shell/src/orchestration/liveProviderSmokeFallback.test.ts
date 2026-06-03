import { describe, expect, it } from "vitest";

import {
  classifyLiveProviderFallbackOutcome,
  shouldAttemptLiveProviderFallback,
} from "./liveProviderSmokeFallback.js";

describe("liveProviderSmokeFallback", () => {
  it("attempts configured fallback once after primary network failure", () => {
    expect(shouldAttemptLiveProviderFallback({
      primaryAttempted: true,
      providerErrorClass: "network",
      status: "provider-called-provider-error",
      fallbackConfigured: true,
    })).toEqual({
      primaryAttempted: true,
      primaryFailureClass: "provider-network",
      fallbackConfigured: true,
      fallbackAttempted: true,
      fallbackOutcome: "skipped",
    });
  });

  it("keeps primary network failure inconclusive when no fallback is configured", () => {
    expect(shouldAttemptLiveProviderFallback({
      primaryAttempted: true,
      providerErrorClass: "timeout",
      status: "provider-called-provider-error",
      fallbackConfigured: false,
    })).toEqual({
      primaryAttempted: true,
      primaryFailureClass: "provider-network",
      fallbackConfigured: false,
      fallbackAttempted: false,
      fallbackOutcome: "inconclusive",
      blocker: "no-configured-fallback-provider",
    });
  });

  it("does not fallback for auth config or product failures", () => {
    for (const input of [
      { providerErrorClass: "auth", status: "provider-called-provider-error" },
      { providerErrorClass: "missing-key", status: "skipped-provider-not-configured" },
      { providerErrorClass: "unsupported", status: "skipped-provider-unsupported" },
      { providerErrorClass: "malformed-response", status: "provider-called-provider-error" },
      { providerErrorClass: "none", status: "provider-called-output-invalid" },
    ]) {
      const decision = shouldAttemptLiveProviderFallback({
        primaryAttempted: true,
        ...input,
        fallbackConfigured: true,
      });
      expect(decision.fallbackAttempted).toBe(false);
      expect(decision.fallbackOutcome).toBe("skipped");
      expect(decision.blocker).toBe("primary-failure-not-network");
    }
  });

  it("classifies fallback success as smoke outcome metadata only", () => {
    expect(classifyLiveProviderFallbackOutcome({
      fallbackAttempted: true,
      exitCode: 0,
      providerErrorClass: "none",
      status: "provider-called-anchor-exact",
    })).toBe("passed");
  });

  it("keeps fallback network failure inconclusive", () => {
    expect(classifyLiveProviderFallbackOutcome({
      fallbackAttempted: true,
      exitCode: 2,
      providerErrorClass: "network",
      status: "provider-called-provider-error",
    })).toBe("inconclusive");
  });
});
