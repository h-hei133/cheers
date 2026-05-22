import { describe, expect, it } from "vitest";

import { approveLiveProviderAdapter } from "./liveProviderAdapterApproval.js";

describe("liveProviderAdapterApproval", () => {
  it("does not approve default or missing opt-in paths", () => {
    const noLiveOptIn = approveLiveProviderAdapter({
      explicitLiveSmokeOptIn: false,
      realProviderSmokeOptIn: true,
      providerReadinessStatus: "ready",
      providerKind: "openai-compatible",
      providerSafeLabel: "openai-compatible",
      privateConfigManualRead: false,
      fixtureSafetyStatus: "safe",
      redactionStatus: "redacted-and-budgeted",
    });
    const noRealProviderOptIn = approveLiveProviderAdapter({
      explicitLiveSmokeOptIn: true,
      realProviderSmokeOptIn: false,
      providerReadinessStatus: "ready",
      providerKind: "openai-compatible",
      providerSafeLabel: "openai-compatible",
      privateConfigManualRead: false,
      fixtureSafetyStatus: "safe",
      redactionStatus: "redacted-and-budgeted",
    });

    expect(noLiveOptIn.decision).toBe("skip-no-opt-in");
    expect(noLiveOptIn.adapterApproved).toBe(false);
    expect(noRealProviderOptIn.decision).toBe("skip-real-provider-smoke-not-enabled");
    expect(noRealProviderOptIn.adapterApproved).toBe(false);
  });

  it("skips unavailable unsupported auth and network readiness states", () => {
    expect(baseApproval({ providerReadinessStatus: "missing-key" }).decision)
      .toBe("skip-provider-not-configured");
    expect(baseApproval({ providerReadinessStatus: "unsupported" }).decision)
      .toBe("skip-provider-unsupported");
    expect(baseApproval({ providerReadinessStatus: "auth" }).decision)
      .toBe("skip-provider-auth");
    expect(baseApproval({ providerReadinessStatus: "network" }).decision)
      .toBe("skip-provider-network");
  });

  it("approves only ready openai-compatible providers without mutation authority", () => {
    const approval = baseApproval({ providerReadinessStatus: "ready" });

    expect(approval.decision).toBe("approved-openai-compatible");
    expect(approval.adapterApproved).toBe(true);
    expect(approval.providerKind).toBe("openai-compatible");
    expect(approval.mutationAuthority).toBe("not-granted");
    expect(approval.evidence).toContain("live-provider-adapter-approval:adapter-approved:true");
    expect(approval.evidence).toContain("live-provider-adapter-approval:no-apply");
  });

  it("stops private config manual reads and redaction risks before approval", () => {
    expect(baseApproval({ privateConfigManualRead: true }).decision)
      .toBe("stop-private-config-manual-read-risk");
    expect(baseApproval({ redactionStatus: "risk" }).decision)
      .toBe("stop-redaction-risk");
  });

  it("does not approve other ready provider kinds", () => {
    const approval = baseApproval({
      providerReadinessStatus: "ready",
      providerKind: "openai",
      providerSafeLabel: "openai",
    });

    expect(approval.decision).toBe("unsupported");
    expect(approval.adapterApproved).toBe(false);
    expect(approval.skipReason).toBe("provider-unsupported");
  });
});

function baseApproval(overrides: Partial<Parameters<typeof approveLiveProviderAdapter>[0]>) {
  return approveLiveProviderAdapter({
    explicitLiveSmokeOptIn: true,
    realProviderSmokeOptIn: true,
    providerReadinessStatus: "ready",
    providerKind: "openai-compatible",
    providerSafeLabel: "openai-compatible",
    providerConfigSource: "explicit-env+provider-env",
    privateConfigManualRead: false,
    fixtureSafetyStatus: "safe",
    redactionStatus: "redacted-and-budgeted",
    ...overrides,
  });
}
