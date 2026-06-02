import { describe, expect, it } from "vitest";

import { decideProviderFallback } from "./fallback.js";

describe("provider fallback decision", () => {
  it("keeps absent fallback and eligibility distinct from execution", () => {
    expect(decideProviderFallback({
      primaryFailureClass: "provider_network",
      fallbackEligibility: "fallback_metadata_unavailable",
      explicitOptIn: false,
    })).toMatchObject({
      status: "no_fallback",
      nextAction: "fail",
      terminalSuccessClaim: false,
    });

    expect(decideProviderFallback({
      primaryFailureClass: "provider_network",
      fallbackEligibility: "fallback_eligible",
      eligibleFailureClasses: ["provider_network"],
      fallbackProviderSafeLabel: "Fallback Provider",
      fallbackModelSafeLabel: "Fallback Model",
      explicitOptIn: true,
    })).toMatchObject({
      status: "fallback_selected",
      nextAction: "fallback",
      selectedProviderSafeLabel: "Fallback Provider",
      terminalSuccessClaim: false,
    });
  });

  it("blocks fallback without opt-in or compatible failure class", () => {
    const decision = decideProviderFallback({
      primaryFailureClass: "provider_auth",
      fallbackEligibility: "fallback_eligible",
      eligibleFailureClasses: ["provider_network"],
      ineligibleFailureClasses: ["provider_auth"],
      fallbackProviderSafeLabel: "Fallback Provider",
      explicitOptIn: false,
    });

    expect(decision.status).toBe("fallback_blocked");
    expect(decision.blockedReasons).toEqual(
      expect.arrayContaining([
        "failure-class-ineligible:provider_auth",
        "failure-class-not-listed:provider_auth",
        "fallback-explicit-opt-in-missing",
      ]),
    );
    expect(decision.terminalSuccessClaim).toBe(false);
  });

  it("records attempted, failed, and completed fallback without task success", () => {
    expect(decideProviderFallback({
      primaryFailureClass: "provider_timeout",
      fallbackEligibility: "fallback_eligible",
      eligibleFailureClasses: ["provider_timeout"],
      fallbackProviderSafeLabel: "Fallback Provider",
      fallbackModelSafeLabel: "Fallback Model",
      explicitOptIn: true,
      fallbackAttempted: true,
    }).status).toBe("fallback_attempted");

    expect(decideProviderFallback({
      primaryFailureClass: "provider_timeout",
      fallbackEligibility: "fallback_eligible",
      eligibleFailureClasses: ["provider_timeout"],
      fallbackProviderSafeLabel: "Fallback Provider",
      fallbackModelSafeLabel: "Fallback Model",
      explicitOptIn: true,
      fallbackAttempted: true,
      fallbackFailed: true,
    })).toMatchObject({
      status: "fallback_failed",
      terminalSuccessClaim: false,
    });

    expect(decideProviderFallback({
      primaryFailureClass: "provider_timeout",
      fallbackEligibility: "fallback_eligible",
      eligibleFailureClasses: ["provider_timeout"],
      fallbackProviderSafeLabel: "Fallback Provider",
      fallbackModelSafeLabel: "Fallback Model",
      explicitOptIn: true,
      fallbackAttempted: true,
      fallbackCompleted: true,
      responseHandoffId: "handoff-fallback",
    })).toMatchObject({
      status: "fallback_completed",
      responseHandoffId: "handoff-fallback",
      terminalSuccessClaim: false,
    });
  });
});
