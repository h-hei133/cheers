import { describe, expect, it } from "vitest";

import { type LiveProviderSmokeResult, buildLiveProviderSmokeResult } from "./liveProviderSmokeResult.js";

describe("liveProviderSmokeResult", () => {
  it("classifies skipped-no-opt-in when no provider called and skip reason is no-opt-in", () => {
    const result = buildLiveProviderSmokeResult({
      runId: "run-1",
      mode: "live-provider-smoke",
      providerSafeLabel: "unknown",
      providerCalled: false,
      skipReason: "no-opt-in",
    });

    expect(result.status).toBe("skipped-no-opt-in");
    expect(result.providerCalled).toBe(false);
    expect(result.changedFiles).toEqual([]);
    expect(result.mutationAuthority).toBe("not-granted");
  });

  it("classifies skipped-provider-not-configured", () => {
    const result = buildLiveProviderSmokeResult({
      runId: "run-2",
      mode: "live-provider-smoke",
      providerSafeLabel: "not-configured",
      providerCalled: false,
      skipReason: "provider-not-configured",
    });

    expect(result.status).toBe("skipped-provider-not-configured");
    expect(result.providerCalled).toBe(false);
  });

  it("classifies skipped-provider-unsupported", () => {
    const result = buildLiveProviderSmokeResult({
      runId: "run-3",
      mode: "live-provider-smoke",
      providerSafeLabel: "unsupported",
      providerCalled: false,
      skipReason: "provider-unsupported",
    });

    expect(result.status).toBe("skipped-provider-unsupported");
  });

  it("classifies skipped-provider-not-ready", () => {
    const result = buildLiveProviderSmokeResult({
      runId: "run-4",
      mode: "live-provider-smoke",
      providerSafeLabel: "not-ready",
      providerCalled: false,
      skipReason: "provider-not-ready",
    });

    expect(result.status).toBe("skipped-provider-not-ready");
  });

  it("classifies provider auth and network skips", () => {
    expect(buildLiveProviderSmokeResult({
      runId: "run-auth",
      mode: "live-provider-smoke",
      providerSafeLabel: "openai-compatible",
      providerKind: "openai-compatible",
      providerCalled: false,
      skipReason: "provider-auth",
      providerErrorClass: "auth",
    }).status).toBe("skipped-provider-auth");

    expect(buildLiveProviderSmokeResult({
      runId: "run-network",
      mode: "live-provider-smoke",
      providerSafeLabel: "openai-compatible",
      providerKind: "openai-compatible",
      providerCalled: false,
      skipReason: "provider-network",
      providerErrorClass: "network",
    }).status).toBe("skipped-provider-network");
  });

  it("classifies prompt-audit-failed when prompt audit did not pass", () => {
    const result = buildLiveProviderSmokeResult({
      runId: "run-5",
      mode: "live-provider-smoke",
      providerSafeLabel: "openai",
      providerCalled: false,
      promptAuditStatus: "fail",
    });

    expect(result.status).toBe("prompt-audit-failed");
  });

  it("classifies provider-called-anchor-exact for exact-ready anchor quality", () => {
    const result = buildLiveProviderSmokeResult({
      runId: "run-6",
      mode: "live-provider-smoke",
      providerSafeLabel: "openai",
      providerCalled: true,
      anchorQuality: "exact-ready",
    });

    expect(result.status).toBe("provider-called-anchor-exact");
    expect(result.providerCalled).toBe(true);
  });

  it("classifies provider-called-anchor-partial for review-only anchor quality", () => {
    const result = buildLiveProviderSmokeResult({
      runId: "run-7",
      mode: "live-provider-smoke",
      providerSafeLabel: "openai",
      providerCalled: true,
      anchorQuality: "review-only",
    });

    expect(result.status).toBe("provider-called-anchor-partial");
  });

  it("classifies provider-called-unsafe-output for unsafe anchor quality", () => {
    const result = buildLiveProviderSmokeResult({
      runId: "run-8",
      mode: "live-provider-smoke",
      providerSafeLabel: "openai",
      providerCalled: true,
      anchorQuality: "unsafe",
    });

    expect(result.status).toBe("provider-called-unsafe-output");
  });

  it("classifies provider-called-output-invalid for invalid output validation", () => {
    const result = buildLiveProviderSmokeResult({
      runId: "run-9",
      mode: "live-provider-smoke",
      providerSafeLabel: "openai",
      providerCalled: true,
      outputValidationStatus: "malformed-output",
    });

    expect(result.status).toBe("provider-called-output-invalid");
  });

  it("classifies provider-called-provider-error before output validation", () => {
    const result = buildLiveProviderSmokeResult({
      runId: "run-provider-error",
      mode: "live-provider-smoke",
      providerSafeLabel: "openai-compatible",
      providerKind: "openai-compatible",
      adapterApproved: true,
      providerCalled: true,
      providerErrorClass: "auth",
    });

    expect(result.status).toBe("provider-called-provider-error");
    expect(result.providerErrorClass).toBe("auth");
    expect(result.adapterApproved).toBe(true);
    expect(result.evidence).toContain("live-provider-smoke-result:provider-error-class:auth");
  });

  it("classifies provider-called-anchor-failed for unsupported anchor quality", () => {
    const result = buildLiveProviderSmokeResult({
      runId: "run-10",
      mode: "live-provider-smoke",
      providerSafeLabel: "openai",
      providerCalled: true,
      anchorQuality: "unsupported",
    });

    expect(result.status).toBe("provider-called-anchor-failed");
  });

  it("preserves all live smoke evidence markers", () => {
    const result = buildLiveProviderSmokeResult({
      runId: "run-11",
      mode: "live-provider-smoke",
      providerSafeLabel: "openai",
      providerCalled: true,
      skipReason: undefined,
      promptAuditId: "audit_1",
      outputValidationId: "val_1",
      anchorQuality: "exact-ready",
      qualityReportId: "report_1",
      scorecardId: "sc_1",
      noWriteStatus: "pass",
    });

    expect(result.evidence).toContain("live-provider-smoke-result:mutation-authority:not-granted");
    expect(result.evidence).toContain("live-provider-smoke-result:adapter-approved:false");
    expect(result.evidence).toContain("live-provider-smoke-result:provider-error-class:none");
    expect(result.evidence).toContain("live-provider-smoke-result:raw-output-excluded");
    expect(result.evidence).toContain("live-provider-smoke-result:no-apply");
    expect(result.mutationAuthority).toBe("not-granted");
    expect(result.changedFiles).toEqual([]);
    expect(result.output).toContain("Mutation authority: not granted");
  });

  it("never includes raw provider output dumps in result output", () => {
    const result = buildLiveProviderSmokeResult({
      runId: "run-12",
      mode: "live-provider-smoke",
      providerSafeLabel: "openai",
      providerCalled: true,
      anchorQuality: "exact-ready",
    });

    expect(result.output).toContain("Raw provider output: excluded");
    const allOutput = Object.values(result).flatMap(v => typeof v === "string" ? [v] : []);
    for (const val of allOutput) {
      expect(val).not.toContain("Bearer");
      expect(val).not.toContain("sk-");
    }
  });
});
