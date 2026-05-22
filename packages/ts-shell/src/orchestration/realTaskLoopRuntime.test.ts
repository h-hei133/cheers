import { describe, expect, it } from "vitest";

import { runRealTaskLoopRuntime } from "./realTaskLoopRuntime.js";

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
    expect(output.runtime?.anchoredProposal?.handoffReadiness).toBe("exact-hunk-set");
    expect(output.result.confirmationStatus).toBe("required");
    expect(output.result.applyStatus).toBe("not-run");
    expect(output.result.status).toBe("confirmation-required");
  });

  it("explicit confirmation applies through existing hunk-set/fenced lanes and readback verifies", async () => {
    const output = await runRealTaskLoopRuntime({
      requestId: "route200-fake-confirm",
      providerMode: "fake",
      confirmApply: true,
    });

    expect(output.applyResult?.status).toBe("hunk-set-applied");
    expect(output.result.changedFiles).toEqual(["src/smoke.ts"]);
    expect(output.result.verificationStatus).toBe("passed");
    expect(output.result.status).toBe("task-loop-complete");
    expect(output.result.evidence).toEqual(
      expect.arrayContaining([
        "edit-proposal-apply:hunk-set-route",
        "proposal-hunk-set-route:no-new-writer",
        "real-task-loop-readback:status:passed",
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
        proposeEdit: () => ({
          operationKind: "exact-fenced-replacement",
          targets: [
            {
              path: "src/smoke.ts",
              summary: "rename startApp declaration to runApp",
              oldText: "export function startApp() {",
              newText: "export function runApp() {",
            },
            {
              path: "src/smoke.ts",
              summary: "rename startApp call site to runApp",
              oldText: "export const bootMessage = startApp();",
              newText: "export const bootMessage = runApp();",
            },
          ],
          confidence: "high",
          riskSummary: "controlled fixture exact rename",
          verificationPlan: ["safe readback verifies runApp and absence of startApp"],
        }),
      },
    });

    expect(output.result.providerCalled).toBe(true);
    expect(output.result.anchorQuality).toBe("exact-ready");
    expect(output.result.status).toBe("confirmation-required");
    expect(output.result.applyStatus).toBe("not-run");
    expect(output.result.mutationScope).toBe("none");
  });

  it("real opt-in with approved available adapter applies only confirmed controlled fixture", async () => {
    const output = await runRealTaskLoopRuntime({
      requestId: "route200-real-opt-in-approved-confirm",
      providerMode: "real-opt-in",
      confirmApply: true,
      providerAvailability: { kind: "available", providerKindLabel: "openai-compatible" },
      provider: {
        proposeEdit: () => ({
          operationKind: "exact-fenced-replacement",
          targets: [
            {
              path: "src/smoke.ts",
              summary: "rename startApp declaration to runApp",
              oldText: "export function startApp() {",
              newText: "export function runApp() {",
            },
            {
              path: "src/smoke.ts",
              summary: "rename startApp call site to runApp",
              oldText: "export const bootMessage = startApp();",
              newText: "export const bootMessage = runApp();",
            },
          ],
          confidence: "high",
          riskSummary: "controlled fixture exact rename",
          verificationPlan: ["safe readback verifies runApp and absence of startApp"],
        }),
      },
    });

    expect(output.result.providerCalled).toBe(true);
    expect(output.result.applyStatus).toBe("applied");
    expect(output.result.changedFiles).toEqual(["src/smoke.ts"]);
    expect(output.result.mutationScope).toBe("controlled-temp-fixture");
    expect(output.result.verificationStatus).toBe("passed");
    expect(output.result.status).toBe("task-loop-complete");
    expect(output.result.evidence).toContain("real-task-loop-result:no-provider-call-during-apply");
  });
});
