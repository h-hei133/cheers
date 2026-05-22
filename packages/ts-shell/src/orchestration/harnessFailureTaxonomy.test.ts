import { describe, expect, it } from "vitest";
import { classifyHarnessFailure } from "./harnessFailureTaxonomy.js";

describe("harnessFailureTaxonomy", () => {
  it("maps core route188 failure classes to safe verifier markers", () => {
    expect(classifyHarnessFailure({ status: "missing target" }).failureClass).toBe("missing-target");
    expect(classifyHarnessFailure({ status: "provider not configured" }).failureClass).toBe("provider-unavailable");
    expect(classifyHarnessFailure({ status: "provider invalid proposal" }).failureClass).toBe("provider-invalid-output");
    expect(classifyHarnessFailure({ evidence: ["verification-command-result:outcome:failed"] }).failureClass).toBe("verification-failed");
    expect(classifyHarnessFailure({ status: "edit partial failure" }).failureClass).toBe("edit-partial-failure");
  });

  it("classifies provider dry-run specific failures", () => {
    expect(classifyHarnessFailure({ status: "dry-run-stopped-no-opt-in" }).failureClass)
      .toBe("provider-dry-run-not-opted-in");
    expect(classifyHarnessFailure({ status: "dry-run-prompt-audit-failed" }).failureClass)
      .toBe("provider-prompt-audit-failed");
    expect(classifyHarnessFailure({ evidence: ["provider-output-validation:status:malformed-output"] }).failureClass)
      .toBe("provider-output-malformed");
    expect(classifyHarnessFailure({ evidence: ["provider-output-validation:status:unanchored-generated"] }).failureClass)
      .toBe("provider-output-unanchored");
    expect(classifyHarnessFailure({ evidence: ["provider-output-validation:status:unsafe-output"] }).failureClass)
      .toBe("provider-output-unsafe");
    expect(classifyHarnessFailure({ evidence: ["provider-output-validation:status:over-budget-output"] }).failureClass)
      .toBe("provider-output-over-budget");
    expect(classifyHarnessFailure({ status: "dry-run-anchor-quality-low" }).failureClass)
      .toBe("provider-anchor-quality-low");
  });
});
