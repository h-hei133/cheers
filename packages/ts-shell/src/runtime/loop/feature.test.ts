import { describe, expect, it } from "vitest";

import { buildModelBoundaryFeatureContract } from "./feature.js";

describe("model boundary feature contract", () => {
  it("declares the model boundary as a loop phase without terminal success", () => {
    const contract = buildModelBoundaryFeatureContract();

    expect(contract.valid).toBe(true);
    expect(contract.declaration).toMatchObject({
      featureId: "model-boundary",
      loopPhase: "model-boundary",
      productSurfaceSection: "model-boundary",
      terminalSuccessClaim: false,
    });
    expect(contract.declaration.inputFacts).toEqual(
      expect.arrayContaining(["context-planning-summary", "provider-registry", "provider-readiness"]),
    );
    expect(contract.declaration.outputHandoffFacts).toEqual(
      expect.arrayContaining(["tool-call-batch-not-dispatched", "provider-failure-classification"]),
    );
    expect(contract.notProvenClaims).toContain("model-response-complete-is-not-task-success");
    expect(contract.terminalSuccessClaim).toBe(false);
  });
});
