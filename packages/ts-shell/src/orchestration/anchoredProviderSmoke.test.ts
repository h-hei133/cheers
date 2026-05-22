import { describe, expect, it } from "vitest";

import { runAnchoredProviderSmoke } from "./anchoredProviderSmoke.js";
import { PROPOSAL_QUALITY_CORPUS } from "./proposalQualityCorpus.js";
import { buildPrompt, readySmokeInput } from "./providerSmokeTestFixtures.js";

describe("anchoredProviderSmoke", () => {
  it("runs deterministic fake corpus through dry-run validation anchoring and report no-write", async () => {
    const run = await runAnchoredProviderSmoke({
      ...readySmokeInput("route196-fake-corpus"),
      mode: "fake-corpus",
    });

    expect(run.gate.decision).toBe("allow-fake-provider-corpus");
    expect(run.dryRuns).toHaveLength(PROPOSAL_QUALITY_CORPUS.length);
    expect(run.qualityReports).toHaveLength(PROPOSAL_QUALITY_CORPUS.length);
    expect(run.changedFiles).toEqual([]);
    expect(run.mutationAuthority).toBe("not-granted");
    expect(run.dryRuns.every((dryRun) => dryRun.mutation === "not-run")).toBe(true);
    expect(run.qualityReports.find((report) => report.caseId === "exact-single-target")?.scorecardStatus).toBe("pass");
    expect(run.qualityReports.find((report) => report.caseId === "partial-anchor")?.scorecardStatus).toBe("warn");
    expect(run.qualityReports.find((report) => report.caseId === "unsafe-output")?.noWriteStatus).toBe("pass");
    expect(run.evidence).toContain("anchored-provider-smoke:provider-call-during-apply:not-run");
  });

  it("skips real-provider smoke without opt-in and does not call provider", async () => {
    let calls = 0;
    const run = await runAnchoredProviderSmoke({
      ...readySmokeInput("route196-no-opt-in"),
      mode: "real-provider-smoke",
      explicitSmokeOptIn: false,
      providerAvailability: { kind: "available", providerKindLabel: "fake-real-provider" },
      provider: {
        proposeEdit: () => {
          calls += 1;
          return { operationKind: "generated-replacement" };
        },
      },
    });

    expect(run.gate.decision).toBe("skip-no-opt-in");
    expect(run.result.status).toBe("real-provider-smoke-skipped-no-opt-in");
    expect(run.result.providerCalled).toBe(false);
    expect(run.harnessTrace.providerDryRunCalled).toBe(false);
    expect(run.harnessScorecard.providerSmokeProviderCalled).toBe(false);
    expect(calls).toBe(0);
  });

  it("skips provider-not-configured safely", async () => {
    const run = await runAnchoredProviderSmoke({
      ...readySmokeInput("route196-provider-missing"),
      mode: "real-provider-smoke",
      explicitSmokeOptIn: true,
      providerAvailability: { kind: "not-configured", reason: "provider-readiness:missing-key" },
    });

    expect(run.gate.decision).toBe("skip-provider-not-configured");
    expect(run.result.status).toBe("real-provider-smoke-skipped-provider-unavailable");
    expect(run.qualityReports[0]?.scorecardStatus).toBe("skip");
  });

  it("runs opt-in real-provider smoke only through supplied provider dry-run adapter", async () => {
    let calls = 0;
    const run = await runAnchoredProviderSmoke({
      ...readySmokeInput("route196-real-opt-in"),
      mode: "real-provider-smoke",
      explicitSmokeOptIn: true,
      providerAvailability: { kind: "available", providerKindLabel: "fake-real-provider" },
      promptContext: buildPrompt("route196-real-opt-in"),
      targetLabel: "src/app.ts",
      currentContent: "runApp\n",
      provider: {
        proposeEdit: () => {
          calls += 1;
          return {
            operationKind: "exact-fenced-replacement",
            targets: [{ path: "src/app.ts", oldText: "runApp", newText: "startApp" }],
            verificationPlan: ["npm test -- app"],
          };
        },
      },
    });

    expect(calls).toBe(1);
    expect(run.gate.decision).toBe("allow-real-provider-smoke");
    expect(run.dryRuns[0]?.status).toBe("dry-run-exact-ready-no-write");
    expect(run.result.providerCalled).toBe(true);
    expect(run.result.changedFiles).toEqual([]);
    expect(run.harnessScorecard.providerSmokeNoWrite).toBe("pass");
  });
});
