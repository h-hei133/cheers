import { describe, expect, it } from "vitest";

import {
  buildClaimLedgerProjection,
  type ClaimLedgerEvidenceSource,
} from "./claimLedgerProjection.js";

describe("claimLedgerProjection", () => {
  it("derives live verified success only from the full proven claim chain", () => {
    const ledger = buildLedger();

    expect(ledger.terminal.status).toBe("verified-success");
    expect(ledger.terminal.resultStatus).toBe("task-loop-complete");
    expect(ledger.terminal.liveSuccess).toBe(true);
    expect(ledger.notProvenClaims).toEqual([]);
    expect(ledger.evidence).toEqual(
      expect.arrayContaining([
        "claim-ledger:terminal:verified-success",
        "claim-ledger:live-success:true",
        "claim-ledger:not-proven:none",
      ]),
    );
  });

  it.each([
    {
      name: "provider-called=false",
      patch: { providerCalled: false },
      blocker: "provider-not-called",
      terminal: "provider-unavailable",
      result: "provider-unavailable",
    },
    {
      name: "provider error",
      patch: { providerErrorClass: "network" },
      blocker: "provider-error",
      terminal: "provider-unavailable",
      result: "provider-unavailable",
    },
    {
      name: "output-validation missing",
      patch: { outputValidationStatus: "none" },
      blocker: "output-validation-missing",
      terminal: "review-required",
      result: "review-required",
    },
    {
      name: "anchor unsupported",
      patch: { anchorQuality: "unsupported", confirmationStatus: "trusted-confirmed" },
      blocker: "anchor-not-exact-ready",
      terminal: "review-required",
      result: "review-required",
    },
    {
      name: "provider call during apply",
      patch: { providerCallDuringApply: true },
      blocker: "provider-call-during-apply",
      terminal: "review-required",
      result: "review-required",
    },
    {
      name: "failed apply",
      patch: {
        applyStatus: "failed",
        mutationScope: "none",
        verificationStatus: "not-run",
        snapshotStatus: "blocked",
        recoveryStatus: "blocked",
      },
      blocker: "apply-not-proven",
      terminal: "review-required",
      result: "review-required",
    },
    {
      name: "recovery incomplete",
      patch: { recoveryStatus: "blocked" },
      blocker: "recovery-incomplete",
      terminal: "review-required",
      result: "review-required",
    },
  ])("$name fails closed even when apply and readback succeeded", ({ patch, blocker, terminal, result }) => {
    const ledger = buildLedger(patch);

    expect(ledger.terminal.status).toBe(terminal);
    expect(ledger.terminal.resultStatus).toBe(result);
    expect(ledger.terminal.status).not.toBe("verification-succeeded-not-live");
    expect(ledger.terminal.resultStatus).not.toBe("verification-succeeded");
    expect(ledger.terminal.liveSuccess).toBe(false);
    expect(ledger.evidence.join("\n")).toContain(blocker);
  });

  it.each([
    {
      name: "provider-called=false",
      patch: { providerCalled: false },
      blocker: "provider-not-called",
    },
    {
      name: "output-validation missing",
      patch: { outputValidationStatus: "none" },
      blocker: "output-validation-missing",
    },
    {
      name: "anchor unsupported",
      patch: { anchorQuality: "unsupported", confirmationStatus: "trusted-confirmed" },
      blocker: "anchor-not-exact-ready",
    },
    {
      name: "apply succeeded but verification not run",
      patch: { verificationStatus: "not-run" },
      blocker: "verification-not-run",
    },
    {
      name: "verification failed",
      patch: { verificationStatus: "failed" },
      blocker: "verification-failed",
    },
    {
      name: "snapshot created without apply",
      patch: {
        applyStatus: "not-run",
        mutationScope: "none",
        verificationStatus: "not-run",
        snapshotStatus: "created",
        recoveryStatus: "available",
      },
      blocker: "apply-not-run",
    },
    {
      name: "recovery available only",
      patch: { verificationStatus: "failed", recoveryStatus: "available" },
      blocker: "verification-failed",
    },
  ])("$name cannot produce live verified success", ({ patch, blocker }) => {
    const ledger = buildLedger(patch);

    expect(ledger.terminal.status).not.toBe("verified-success");
    expect(ledger.terminal.resultStatus).not.toBe("task-loop-complete");
    expect(ledger.terminal.liveSuccess).toBe(false);
    expect(ledger.evidence.join("\n")).toContain(blocker);
  });

  it.each([
    { evidenceSource: "fake-ready" as const },
    { evidenceSource: "fake-provider" as const },
    { evidenceSource: "focused-tests" as const },
  ])("$evidenceSource evidence cannot be labeled live success", ({ evidenceSource }) => {
    const ledger = buildLedger({ evidenceSource });

    expect(ledger.terminal.status).toBe("verification-succeeded-not-live");
    expect(ledger.terminal.resultStatus).toBe("verification-succeeded");
    expect(ledger.terminal.liveSuccess).toBe(false);
    expect(ledger.evidence).toEqual(
      expect.arrayContaining([
        `claim-ledger:evidence-source:${evidenceSource}`,
        "claim-ledger:terminal:verification-succeeded-not-live",
        "claim-ledger:live-success:false",
        "claim-ledger:not-proven:provider:not-live-provider-evidence",
      ]),
    );
  });

  it("default no-provider no-apply is a safe skip, not terminal success", () => {
    const ledger = buildLedger({
      evidenceSource: "default-safe",
      providerKind: "none",
      liveOptIn: false,
      providerCalled: false,
      outputValidationStatus: "none",
      anchorQuality: "none",
      handoffReadiness: undefined,
      confirmationStatus: "not-requested",
      applyStatus: "not-run",
      verificationStatus: "not-run",
      snapshotStatus: "not-run",
      recoveryStatus: "not-run",
      mutationScope: "none",
    });

    expect(ledger.terminal.status).toBe("skipped");
    expect(ledger.terminal.resultStatus).toBe("skipped-no-provider-opt-in");
    expect(ledger.terminal.liveSuccess).toBe(false);
    expect(ledger.provider.status).toBe("not-required");
  });

  it("fake provider cannot be promoted by a live-provider evidence label", () => {
    const ledger = buildLedger({
      evidenceSource: "live-provider",
      providerKind: "fake-provider",
      liveOptIn: true,
    });

    expect(ledger.terminal.status).toBe("review-required");
    expect(ledger.terminal.resultStatus).toBe("review-required");
    expect(ledger.terminal.liveSuccess).toBe(false);
    expect(ledger.evidence).toContain(
      "claim-ledger:not-proven:provider:not-live-provider-evidence",
    );
  });
});

function buildLedger(
  patch: Partial<Parameters<typeof buildClaimLedgerProjection>[0]> = {},
) {
  const evidenceSource = (patch.evidenceSource ?? "live-provider") as ClaimLedgerEvidenceSource;
  return buildClaimLedgerProjection({
    taskLoopId: "real_task_loop_test",
    fixtureId: "fixture-test",
    evidenceSource,
    providerKind: evidenceSource === "fake-provider" ? "fake-provider" : "openai-compatible",
    liveOptIn: evidenceSource === "live-provider" || evidenceSource === "fake-ready",
    providerCalled: true,
    outputValidationStatus: "valid-exact-single-target",
    anchorQuality: "exact-ready",
    handoffReadiness: "exact-single-target",
    confirmationStatus: "trusted-confirmed",
    applyStatus: "succeeded",
    verificationStatus: "succeeded",
    snapshotStatus: "created",
    recoveryStatus: "available",
    mutationScope: "controlled-temp-workspace",
    providerCallDuringApply: false,
    scorecardStatus: "pass",
    ...patch,
  });
}
