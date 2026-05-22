import { describe, expect, it } from "vitest";

import { evaluateAnchoredProviderSmokeGate } from "./anchoredProviderSmokeGate.js";
import { getProposalQualityCorpusCase } from "./proposalQualityCorpus.js";
import { buildProposalQualityReport } from "./proposalQualityReport.js";
import { runRealProviderProposalDryRun } from "./realProviderProposalDryRun.js";
import { buildPrompt, readyDryRunInput } from "./providerSmokeTestFixtures.js";

describe("proposalQualityReport", () => {
  it("reports exact-ready no-write dry-run quality without raw provider output", async () => {
    const result = await runRealProviderProposalDryRun({
      ...readyDryRunInput("route196-report"),
      provider: {
        proposeEdit: () => ({
          operationKind: "exact-fenced-replacement",
          targets: [{ path: "src/app.ts", oldText: "runApp", newText: "startApp" }],
          verificationPlan: ["npm test -- app"],
        }),
      },
      currentContentByTargetLabel: new Map([["src/app.ts", "runApp\n"]]),
    });
    const report = buildProposalQualityReport({
      runId: "quality_report_test",
      mode: "fake-corpus",
      case: getProposalQualityCorpusCase("exact-single-target"),
      dryRun: result,
    });

    expect(report.scorecardStatus).toBe("pass");
    expect(report.providerCalled).toBe(true);
    expect(report.outputValidationStatus).toBe("valid-exact-single-target");
    expect(report.noWriteStatus).toBe("pass");
    expect(report.rawOutput).toBe("excluded");
    expect(report.evidence).toContain("proposal-quality-report:raw-output-excluded");
  });

  it("records safe skip reports for real-provider smoke without opt-in", () => {
    const gate = evaluateAnchoredProviderSmokeGate({
      requestId: "route196-skip-report",
      mode: "real-provider",
      explicitSmokeOptIn: false,
      providerAvailability: { kind: "available", providerKindLabel: "fake-real-provider" },
      lifecycleId: "life_196",
      analysisBriefId: "analysis_196",
      analysisQualityId: "analysis_quality_196",
      analysisQualityDecision: "allow",
      planQualityId: "plan_quality_196",
      planQualityLevel: "ready",
      promptAuditStatus: "pass",
      dryRunMode: "no-write",
      redactionStatus: "redacted-and-budgeted",
    });
    const report = buildProposalQualityReport({
      runId: "quality_report_skip",
      mode: "real-provider-smoke",
      gate,
      providerSafeLabel: "fake-real-provider",
    });

    expect(report.scorecardStatus).toBe("skip");
    expect(report.providerCalled).toBe(false);
    expect(report.skipReason).toBe("no-opt-in");
  });

  it("fails invalid output quality reports while preserving no-write status", async () => {
    const dryRun = await runRealProviderProposalDryRun({
      ...readyDryRunInput("route196-invalid-report"),
      promptContext: buildPrompt("route196-invalid-report"),
      provider: {
        proposeEdit: () => ({ operationKind: "generated-replacement" }),
      },
    });
    const report = buildProposalQualityReport({
      runId: "quality_report_invalid",
      mode: "fake-corpus",
      case: getProposalQualityCorpusCase("unanchored-generated"),
      dryRun,
    });

    expect(report.scorecardStatus).toBe("fail");
    expect(report.failureClass).toBe("smoke output invalid");
    expect(report.noWriteStatus).toBe("pass");
  });
});
