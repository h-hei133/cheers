import { describe, expect, it } from "vitest";

import { runLiveProviderSmokeCalibration } from "./liveProviderSmokeCalibration.js";
import { buildLiveSmokeFixture } from "./liveProviderSmokeFixture.js";

describe("liveProviderSmokeCalibration", () => {
  const baseFixture = buildLiveSmokeFixture({
    fixtureId: "cal-test",
    requestId: "cal-test-1",
  });

  it("skips safely without explicit opt-in", async () => {
    const cal = await runLiveProviderSmokeCalibration({
      requestId: "cal-skip-opt-in",
      mode: "live-provider-smoke",
      explicitSmokeOptIn: false,
      providerAvailability: { kind: "available", providerKindLabel: "openai" },
      fixture: baseFixture,
    });

    expect(cal.gate.decision).toBe("skip-no-opt-in");
    expect(cal.result.status).toBe("skipped-no-opt-in");
    expect(cal.result.providerCalled).toBe(false);
    expect(cal.dryRun).toBeNull();
    expect(cal.changedFiles).toEqual([]);
    expect(cal.mutationAuthority).toBe("not-granted");
  });

  it("skips safely when provider is not configured", async () => {
    const cal = await runLiveProviderSmokeCalibration({
      requestId: "cal-no-provider",
      mode: "live-provider-smoke",
      explicitSmokeOptIn: true,
      providerAvailability: { kind: "not-configured", reason: "provider-readiness:missing-key" },
      fixture: baseFixture,
    });

    expect(cal.gate.decision).toBe("skip-provider-not-configured");
    expect(cal.result.status).toBe("skipped-provider-not-configured");
    expect(cal.result.providerCalled).toBe(false);
  });

  it("skips safely when provider is unsupported", async () => {
    const cal = await runLiveProviderSmokeCalibration({
      requestId: "cal-unsupported",
      mode: "live-provider-smoke",
      explicitSmokeOptIn: true,
      providerAvailability: { kind: "unsupported", reason: "unsupported" },
      fixture: baseFixture,
    });

    expect(cal.gate.decision).toBe("skip-provider-unsupported");
    expect(cal.result.status).toBe("skipped-provider-unsupported");
    expect(cal.result.providerCalled).toBe(false);
  });

  it("calls provider when opt-in and readiness gates pass", async () => {
    let calls = 0;
    const cal = await runLiveProviderSmokeCalibration({
      requestId: "cal-real-call",
      mode: "live-provider-smoke",
      explicitSmokeOptIn: true,
      providerAvailability: { kind: "available", providerKindLabel: "fake-real" },
      fixture: baseFixture,
      lifecycleId: "life_197",
      analysisBriefId: "analysis_197",
      analysisQualityId: "analysis_quality_197",
      analysisQualityDecision: "allow",
      planQualityId: "plan_quality_197",
      planQualityLevel: "ready",
      contextPacketId: "ctx_197",
      contextGraphId: "graph_197",
      codeGraphTraceId: "code_trace_197",
      taskExecutionPlanId: "exec_197",
      redactionStatus: "redacted-and-budgeted",
      provider: {
        proposeEdit: () => {
          calls += 1;
          return {
            operationKind: "exact-fenced-replacement",
            targets: [
              {
                path: "src/smoke.ts",
                summary: "rename startApp to runApp",
                oldText: "export function startApp() {",
                newText: "export function runApp() {",
              },
            ],
            verificationPlan: ["npm test -- smoke"],
          };
        },
      },
    });

    expect(calls).toBe(1);
    expect(cal.gate.decision).toBe("allow-real-provider-smoke");
    expect(cal.result.providerCalled).toBe(true);
    expect(cal.result.status).toBe("provider-called-anchor-exact");
    expect(cal.changedFiles).toEqual([]);
    expect(cal.mutationAuthority).toBe("not-granted");
    expect(cal.harnessScorecard.providerSmokeProviderCalled).toBe(true);
    expect(cal.harnessScorecard.providerSmokeNoWrite).toBe("pass");
  });

  it("uses fixture promptContext evidence when top-level ids are absent", async () => {
    let calls = 0;
    const fixture = buildLiveSmokeFixture({
      fixtureId: "cal-prompt-context-evidence",
      requestId: "cal-prompt-context-evidence-1",
      lifecycleId: "life_from_prompt",
      analysisBriefId: "analysis_from_prompt",
      analysisQualityId: "analysis_quality_from_prompt",
      planQualityId: "plan_quality_from_prompt",
      planQualityLevel: "ready",
      contextPacketId: "ctx_from_prompt",
      contextGraphId: "graph_from_prompt",
      codeGraphTraceId: "code_trace_from_prompt",
      taskExecutionPlanId: "exec_from_prompt",
    });

    const cal = await runLiveProviderSmokeCalibration({
      requestId: "cal-prompt-context-evidence",
      mode: "live-provider-smoke",
      explicitSmokeOptIn: true,
      providerAvailability: { kind: "available", providerKindLabel: "fake-ready" },
      fixture,
      provider: {
        proposeEdit: () => {
          calls += 1;
          return {
            operationKind: "exact-fenced-replacement",
            targets: [
              {
                path: "src/smoke.ts",
                summary: "rename startApp to runApp",
                oldText: "export function startApp() {",
                newText: "export function runApp() {",
              },
            ],
            verificationPlan: ["npm test -- smoke"],
          };
        },
      },
    });

    expect(calls).toBe(1);
    expect(cal.gate.decision).toBe("allow-real-provider-smoke");
    expect(cal.normalizedEvidence.lifecycleId).toBe("life_from_prompt");
    expect(cal.normalizedEvidence.analysisQualityId).toBe("analysis_quality_from_prompt");
    expect(cal.normalizedEvidence.planQualityId).toBe("plan_quality_from_prompt");
    expect(cal.result.providerCalled).toBe(true);
    expect(cal.qualityReport.outputValidationStatus).toBe("valid-exact-single-target");
    expect(cal.qualityReport.anchorQuality).toBe("exact-ready");
    expect(cal.qualityReport.rawOutput).toBe("excluded");
    expect(cal.result.redactionStatus).toBe("raw-content-excluded");
    expect(cal.changedFiles).toEqual([]);
  });

  it("produces harness trace and scorecard on skip", async () => {
    const cal = await runLiveProviderSmokeCalibration({
      requestId: "cal-skip-trace",
      mode: "live-provider-smoke",
      explicitSmokeOptIn: false,
      providerAvailability: { kind: "available", providerKindLabel: "openai" },
      fixture: baseFixture,
    });

    expect(cal.harnessTrace.traceId).toBeTruthy();
    expect(cal.harnessScorecard.scorecardId).toBeTruthy();
    expect(cal.harnessTrace.providerDryRunCalled).toBe(false);
    expect(cal.harnessScorecard.providerSmokeMode).toBe("live-provider-smoke");
    expect(cal.harnessScorecard.providerSmokeProviderCalled).toBe(false);
  });

  it("produces quality report with shared report shape for live smoke", async () => {
    const cal = await runLiveProviderSmokeCalibration({
      requestId: "cal-quality-report",
      mode: "live-provider-smoke",
      explicitSmokeOptIn: false,
      providerAvailability: { kind: "available", providerKindLabel: "openai" },
      fixture: baseFixture,
    });

    expect(cal.qualityReport.reportId).toBeTruthy();
    expect(cal.qualityReport.mode).toBe("live-provider-smoke");
    expect(cal.qualityReport.providerCalled).toBe(false);
    expect(cal.qualityReport.noWriteStatus).toBe("pass");
    expect(cal.qualityReport.rawOutput).toBe("excluded");
  });

  it("supports fake-corpus mode through the same calibration path", async () => {
    const cal = await runLiveProviderSmokeCalibration({
      requestId: "cal-fake-corpus",
      mode: "fake-corpus",
      explicitSmokeOptIn: false,
      providerAvailability: { kind: "not-configured", reason: "unused" },
      fixture: baseFixture,
      lifecycleId: "life_197",
      analysisBriefId: "analysis_197",
      analysisQualityId: "analysis_quality_197",
      analysisQualityDecision: "allow",
      planQualityId: "plan_quality_197",
      planQualityLevel: "ready",
      contextPacketId: "ctx_197",
      contextGraphId: "graph_197",
      codeGraphTraceId: "code_trace_197",
      taskExecutionPlanId: "exec_197",
      redactionStatus: "redacted-and-budgeted",
    });

    expect(cal.gate.decision).toBe("allow-fake-provider-corpus");
    expect(cal.result.mode).toBe("fake-corpus");
    expect(cal.mutationAuthority).toBe("not-granted");
  });

  it("stops on missing lifecycle evidence after promptContext normalization", async () => {
    const fixtureWithoutLifecycle = {
      ...baseFixture,
      promptContext: {
        ...baseFixture.promptContext,
        taskLifecycleId: undefined,
      },
    };

    const cal = await runLiveProviderSmokeCalibration({
      requestId: "cal-no-lifecycle",
      mode: "live-provider-smoke",
      explicitSmokeOptIn: true,
      providerAvailability: { kind: "available", providerKindLabel: "openai" },
      fixture: fixtureWithoutLifecycle,
    });

    expect(cal.gate.allowed).toBe(false);
    expect(cal.gate.decision).toBe("stop-missing-lifecycle");
    expect(cal.result.providerCalled).toBe(false);
  });

  it("never calls provider when no provider adapter is supplied", async () => {
    const cal = await runLiveProviderSmokeCalibration({
      requestId: "cal-no-adapter",
      mode: "live-provider-smoke",
      explicitSmokeOptIn: true,
      providerAvailability: { kind: "available", providerKindLabel: "openai" },
      fixture: baseFixture,
      lifecycleId: "life_197",
      analysisBriefId: "analysis_197",
      analysisQualityId: "analysis_quality_197",
      analysisQualityDecision: "allow",
      planQualityId: "plan_quality_197",
      planQualityLevel: "ready",
      contextPacketId: "ctx_197",
      contextGraphId: "graph_197",
      codeGraphTraceId: "code_trace_197",
      taskExecutionPlanId: "exec_197",
      redactionStatus: "redacted-and-budgeted",
    });

    expect(cal.result.providerCalled).toBe(false);
    expect(cal.mutationAuthority).toBe("not-granted");
  });

  it("surfaces all required evidence markers", async () => {
    const cal = await runLiveProviderSmokeCalibration({
      requestId: "cal-evidence",
      mode: "live-provider-smoke",
      explicitSmokeOptIn: false,
      providerAvailability: { kind: "available", providerKindLabel: "openai" },
      fixture: baseFixture,
    });

    expect(cal.evidence).toContain("live-smoke-calibration:mutation:not-run");
    expect(cal.evidence).toContain("live-smoke-calibration:mutation-authority:not-granted");
    expect(cal.evidence).toContain("live-smoke-calibration:no-apply");
    expect(cal.evidence).toContain("live-smoke-calibration:raw-output-excluded");
    expect(cal.evidence).toContain("live-smoke-calibration:provider-call-during-apply:not-run");
  });
});
