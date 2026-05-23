import { describe, expect, it } from "vitest";

import { runRealTaskLoopRuntime } from "./realTaskLoopRuntime.js";
import {
  realTaskLoopExactNewText,
  realTaskLoopExactOldText,
  realTaskLoopRepairableFailedText,
} from "./realTaskLoopFixture.js";
import type { ProviderEditRawProposal } from "./providerEditProposal.js";

describe("realTaskLoopRuntime", () => {
  it("default mode does not call provider and does not apply", async () => {
    const output = await runRealTaskLoopRuntime({
      requestId: "route200-default",
      providerMode: "default-skip",
    });

    expect(output.result.providerCalled).toBe(false);
    expect(output.result.applyStatus).toBe("not-run");
    expect(output.result.changedFiles).toEqual([]);
    expect(output.result.evidence).toContain("real-task-loop-result:no-direct-provider-mutation");
  });

  it("fake provider exact output reaches confirmation-required without applying", async () => {
    const output = await runRealTaskLoopRuntime({
      requestId: "route200-fake-no-confirm",
      providerMode: "fake",
    });

    expect(output.runtime?.dryRun?.providerCalled).toBe(true);
    expect(output.result.outputValidationStatus).toBe("valid-exact-single-target");
    expect(output.runtime?.anchoredProposal?.handoffReadiness).toBe("exact-single-target");
    expect(output.result.confirmationStatus).toBe("required");
    expect(output.result.applyStatus).toBe("not-run");
    expect(output.result.status).toBe("confirmation-required");
  });

  it("explicit confirmation applies through existing exact apply lane and readback verifies", async () => {
    const output = await runRealTaskLoopRuntime({
      requestId: "route200-fake-confirm",
      providerMode: "fake",
      confirmApply: true,
    });

    expect(output.applyResult?.status).toBe("single-target-applied");
    expect(output.result.changedFiles).toEqual(["src/smoke.ts"]);
    expect(output.result.outputValidationStatus).toBe("valid-exact-single-target");
    expect(output.result.confirmationStatus).toBe("trusted-confirmed");
    expect(output.result.applyStatus).toBe("succeeded");
    expect(output.result.verificationStatus).toBe("succeeded");
    expect(output.result.snapshotStatus).toBe("created");
    expect(output.result.recoveryStatus).toBe("available");
    expect(output.result.providerCallDuringApply).toBe(false);
    expect(output.result.status).toBe("verification-succeeded");
    expect(output.result.claimLedger.terminal.status).toBe("verification-succeeded-not-live");
    expect(output.result.claimLedger.terminal.liveSuccess).toBe(false);
    expect(output.result.evidence).toEqual(
      expect.arrayContaining([
        "edit-proposal-apply:existing-fenced-route",
        "real-task-loop-readback:status:passed",
        "claim-ledger:terminal:verification-succeeded-not-live",
        "claim-ledger:live-success:false",
        "real-task-loop-result:output-validation:valid-exact-single-target",
        "real-task-loop-result:confirmation:trusted-confirmed",
        "real-task-loop-result:apply:succeeded",
        "real-task-loop-result:verification:succeeded",
        "real-task-loop-result:snapshot:created",
        "real-task-loop-result:recovery:available",
        "real-task-loop-result:mutation-scope:controlled-temp-workspace",
        "real-task-loop-result:provider-call-during-apply:false",
      ]),
    );
  });

  it("verification failure becomes repair eligible without automatic repair", async () => {
    const output = await runRealTaskLoopRuntime({
      requestId: "route200-verification-failure",
      providerMode: "fake",
      confirmApply: true,
      simulateVerificationFailure: true,
    });

    expect(output.result.verificationStatus).toBe("failed");
    expect(output.result.repairEligibility).toBe("eligible");
    expect(output.result.status).toBe("repair-eligible");
    expect(output.result.evidence).toContain("real-task-loop-result:no-provider-call-during-apply");
  });

  it("creates an exact-ready repair proposal after controlled verification failure without applying repair", async () => {
    const output = await runRealTaskLoopRuntime({
      requestId: "route205-repair-proposal",
      providerMode: "fake",
      confirmApply: true,
      runRepairAfterVerificationFailure: true,
    });

    expect(output.applyResult?.status).toBe("single-target-applied");
    expect(output.result.verificationStatus).toBe("failed");
    expect(output.result.repairProof?.proposalStatus).toBe("created");
    expect(output.result.repairProof?.anchorStatus).toBe("exact-ready");
    expect(output.result.repairProof?.confirmationStatus).toBe("required");
    expect(output.result.repairProof?.applyStatus).toBe("not-run");
    expect(output.result.repairProof?.verificationStatus).toBe("not-run");
    expect(output.result.status).toBe("repair-confirmation-required");
    expect(output.result.claimLedger.terminal.status).toBe("repair-confirmation-required");
    expect(output.result.claimLedger.terminal.liveSuccess).toBe(false);
    expect(output.result.changedFiles).toEqual(["src/smoke.ts"]);
    expect(output.result.evidence).toEqual(
      expect.arrayContaining([
        "real-task-loop-repair:proposal:created",
        "real-task-loop-repair:confirmation:required",
        "real-task-loop-repair:apply:not-run",
        "real-task-loop-repair:no-new-writer",
        "claim-ledger:verification:failed",
        "claim-ledger:repair:repair-confirmation-required",
      ]),
    );
  });

  it("applies confirmed repair through existing exact lane and re-verifies before repair success", async () => {
    const output = await runRealTaskLoopRuntime({
      requestId: "route205-repair-confirmed",
      providerMode: "real-opt-in",
      providerAvailability: { kind: "available", providerKindLabel: "openai-compatible" },
      provider: {
        proposeEdit: () => buildRepairableFailureProposal(),
      },
      confirmApply: true,
      runRepairAfterVerificationFailure: true,
      confirmRepairApply: true,
      evidenceSource: "live-provider",
    });

    expect(output.applyResult?.status).toBe("single-target-applied");
    expect(output.result.verificationStatus).toBe("failed");
    expect(output.repair?.applyResult?.status).toBe("single-target-applied");
    expect(output.result.repairProof?.originalFailurePreserved).toBe(true);
    expect(output.result.repairProof?.confirmationStatus).toBe("trusted-confirmed");
    expect(output.result.repairProof?.applyStatus).toBe("succeeded");
    expect(output.result.repairProof?.verificationStatus).toBe("succeeded");
    expect(output.result.repairProof?.providerCallDuringApply).toBe(false);
    expect(output.result.repairProof?.evidenceSource).toBe("fake-provider");
    expect(output.result.repairProof?.originalFailureRuntimeDerived).toBe(true);
    expect(output.result.repairProof?.verificationRuntimeDerived).toBe(true);
    expect(output.result.repairProof?.verificationEvidenceCount).toBeGreaterThan(0);
    expect(output.result.status).toBe("verification-succeeded-with-repair");
    expect(output.result.claimLedger.terminal.status).toBe("verification-succeeded-with-repair-not-live");
    expect(output.result.claimLedger.terminal.liveSuccess).toBe(false);
    expect(output.result.evidence).toEqual(
      expect.arrayContaining([
        "real-task-loop-result:original-verification:failed",
        "real-task-loop-repair:original-readback:failed",
        "real-task-loop-repair:original-failure-runtime-derived:true",
        "real-task-loop-repair:proposal-source:fake-provider",
        "real-task-loop-repair:existing-exact-apply-lane",
        "real-task-loop-repair:apply-route:existing-exact-lane",
        "real-task-loop-repair:readback:status:passed",
        "real-task-loop-repair:verification-runtime-derived:true",
        "real-task-loop-repair:verification:succeeded",
        "real-task-loop-repair:provider-call-during-apply:false",
        "claim-ledger:verification:failed",
        "claim-ledger:repair:repair-verification-succeeded",
        "claim-ledger:terminal:verification-succeeded-with-repair-not-live",
        "claim-ledger:not-proven:repair:not-live-repair-evidence",
      ]),
    );
  });

  it("real opt-in with unavailable provider stops before provider call and apply", async () => {
    const output = await runRealTaskLoopRuntime({
      requestId: "route200-provider-unavailable",
      providerMode: "real-opt-in",
      providerAvailability: { kind: "not-configured", reason: "test missing config" },
    });

    expect(output.runtime?.dryRun).toBeUndefined();
    expect(output.result.providerCalled).toBe(false);
    expect(output.result.applyStatus).toBe("not-run");
  });

  it("real opt-in with approved available adapter reaches confirmation-required without applying", async () => {
    const output = await runRealTaskLoopRuntime({
      requestId: "route200-real-opt-in-approved-no-confirm",
      providerMode: "real-opt-in",
      providerAvailability: { kind: "available", providerKindLabel: "openai-compatible" },
      provider: {
        proposeEdit: () => buildSingleTargetProposal(),
      },
    });

    expect(output.result.providerCalled).toBe(true);
    expect(output.result.outputValidationStatus).toBe("valid-exact-single-target");
    expect(output.result.anchorQuality).toBe("exact-ready");
    expect(output.result.confirmationStatus).toBe("required");
    expect(output.result.status).toBe("confirmation-required");
    expect(output.result.applyStatus).toBe("not-run");
    expect(output.result.mutationScope).toBe("none");
  });

  it("trusted confirmation does not apply unless the provider proposal is exact-ready", async () => {
    const output = await runRealTaskLoopRuntime({
      requestId: "route200-real-opt-in-review-confirm",
      providerMode: "real-opt-in",
      confirmApply: true,
      providerAvailability: { kind: "available", providerKindLabel: "openai-compatible" },
      provider: {
        proposeEdit: () => ({
          operationKind: "exact-fenced-replacement",
          targets: [
            {
              path: "src/smoke.ts",
              summary: "rename missing declaration",
              oldText: "export function missingStartApp() {",
              newText: "export function runApp() {",
            },
          ],
          confidence: "medium",
          riskSummary: "non matching anchor should not be applied",
          verificationPlan: ["readback would be required if exact-ready"],
        }),
      },
    });

    expect(output.result.providerCalled).toBe(true);
    expect(output.result.confirmationStatus).toBe("invalid");
    expect(output.result.applyStatus).toBe("not-run");
    expect(output.result.verificationStatus).toBe("not-run");
    expect(output.result.changedFiles).toEqual([]);
    expect(output.result.providerCallDuringApply).toBe(false);
    expect(output.result.claimLedger.authority.status).toBe("invalid");
    expect(output.result.claimLedger.terminal.status).toBe("review-required");
    expect(output.result.status).toBe("review-required");
  });

  it("real opt-in with approved available adapter applies only confirmed controlled fixture", async () => {
    const output = await runRealTaskLoopRuntime({
      requestId: "route200-real-opt-in-approved-confirm",
      providerMode: "real-opt-in",
      confirmApply: true,
      providerAvailability: { kind: "available", providerKindLabel: "openai-compatible" },
      provider: {
        proposeEdit: () => buildSingleTargetProposal(),
      },
    });

    expect(output.result.providerCalled).toBe(true);
    expect(output.result.outputValidationStatus).toBe("valid-exact-single-target");
    expect(output.result.confirmationStatus).toBe("trusted-confirmed");
    expect(output.result.applyStatus).toBe("succeeded");
    expect(output.result.changedFiles).toEqual(["src/smoke.ts"]);
    expect(output.result.mutationScope).toBe("controlled-temp-workspace");
    expect(output.result.snapshotStatus).toBe("created");
    expect(output.result.recoveryStatus).toBe("available");
    expect(output.result.verificationStatus).toBe("succeeded");
    expect(output.result.providerCallDuringApply).toBe(false);
    expect(output.result.status).toBe("verification-succeeded");
    expect(output.result.claimLedger.evidenceSource).toBe("focused-tests");
    expect(output.result.claimLedger.terminal.status).toBe("verification-succeeded-not-live");
    expect(output.result.claimLedger.terminal.liveSuccess).toBe(false);
    expect(output.result.evidence).toContain("real-task-loop-result:no-provider-call-during-apply");
  });

  it("explicit live provenance is required before confirmed readback becomes verified success", async () => {
    const output = await runRealTaskLoopRuntime({
      requestId: "route204-real-opt-in-approved-confirm-live",
      providerMode: "real-opt-in",
      confirmApply: true,
      evidenceSource: "live-provider",
      providerAvailability: { kind: "available", providerKindLabel: "openai-compatible" },
      provider: {
        proposeEdit: () => buildSingleTargetProposal(),
      },
    });

    expect(output.result.providerCalled).toBe(true);
    expect(output.result.outputValidationStatus).toBe("valid-exact-single-target");
    expect(output.result.applyStatus).toBe("succeeded");
    expect(output.result.verificationStatus).toBe("succeeded");
    expect(output.result.providerCallDuringApply).toBe(false);
    expect(output.result.status).toBe("task-loop-complete");
    expect(output.result.claimLedger.evidenceSource).toBe("live-provider");
    expect(output.result.claimLedger.terminal.status).toBe("verified-success");
    expect(output.result.claimLedger.terminal.liveSuccess).toBe(true);
  });

  it("unsupported anchors remain review-required and no-write", async () => {
    const output = await runRealTaskLoopRuntime({
      requestId: "route203-real-opt-in-unsupported-anchor",
      providerMode: "real-opt-in",
      providerAvailability: { kind: "available", providerKindLabel: "openai-compatible" },
      provider: {
        proposeEdit: () => ({
          ...buildSingleTargetProposal(),
          targets: [
            {
              path: "src/smoke.ts",
              summary: "non matching bounded rename",
              oldText: realTaskLoopExactOldText.replace("startApp();", "missingStartApp();"),
              newText: realTaskLoopExactNewText,
            },
          ],
        }),
      },
    });

    expect(output.result.providerCalled).toBe(true);
    expect(output.result.outputValidationStatus).toBe("valid-exact-single-target");
    expect(output.result.anchorQuality).toBe("unsupported");
    expect(output.result.confirmationStatus).toBe("not-requested");
    expect(output.result.applyStatus).toBe("not-run");
    expect(output.result.verificationStatus).toBe("not-run");
    expect(output.result.status).toBe("review-required");
    expect(output.result.claimLedger.terminal.status).toBe("review-required");
    expect(output.result.claimLedger.terminal.liveSuccess).toBe(false);
    expect(output.result.evidence).toContain("real-task-loop-result:anchor-quality:unsupported");
  });
});

function buildSingleTargetProposal(): ProviderEditRawProposal {
  return {
    operationKind: "exact-fenced-replacement",
    targets: [
      {
        path: "src/smoke.ts",
        summary: "rename startApp declaration and local call site to runApp",
        oldText: realTaskLoopExactOldText,
        newText: realTaskLoopExactNewText,
      },
    ],
    confidence: "high",
    riskSummary: "controlled fixture exact rename",
    verificationPlan: ["safe readback verifies runApp and absence of startApp"],
  };
}

function buildRepairableFailureProposal(): ProviderEditRawProposal {
  return {
    operationKind: "exact-fenced-replacement",
    targets: [
      {
        path: "src/smoke.ts",
        summary: "rename declaration while leaving a deterministic call-site verification failure",
        oldText: realTaskLoopExactOldText,
        newText: realTaskLoopRepairableFailedText,
      },
    ],
    confidence: "high",
    riskSummary: "controlled fixture exact repair-chain setup",
    verificationPlan: ["readback detects remaining old call site before repair"],
  };
}
