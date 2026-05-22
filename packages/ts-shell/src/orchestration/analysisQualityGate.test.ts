import { describe, expect, it } from "vitest";

import { evaluateAnalysisQualityGate } from "./analysisQualityGate.js";

describe("analysis quality gate", () => {
  it("never upgrades edit apply readiness into mutation authority", () => {
    const gate = evaluateAnalysisQualityGate({ action: "edit-apply-readiness" });

    expect(gate.decision).toBe("stop-mutation-not-authorized");
    expect(gate.allowed).toBe(false);
    expect(gate.mutationAuthority).toBe("not-granted");
    expect(gate.providerCall).toBe("not-run");
  });

  it("stops provider proposal when analysis is missing", () => {
    const gate = evaluateAnalysisQualityGate({ action: "provider-proposal" });

    expect(gate.decision).toBe("stop-missing-analysis");
    expect(gate.allowed).toBe(false);
    expect(gate.evidence).toContain("analysis-quality-gate:provider-call:not-run");
  });
});
