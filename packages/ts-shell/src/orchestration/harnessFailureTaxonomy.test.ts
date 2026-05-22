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

  it("classifies provider anchoring failures", () => {
    expect(classifyHarnessFailure({ evidence: ["provider-anchor-match:outcome:no-match"] }).failureClass)
      .toBe("provider-anchor-no-match");
    expect(classifyHarnessFailure({ evidence: ["provider-anchor-match:outcome:multiple-candidates-ambiguous"] }).failureClass)
      .toBe("provider-anchor-ambiguous");
    expect(classifyHarnessFailure({ evidence: ["provider-anchor-conflict:kind:stale-match-facts"] }).failureClass)
      .toBe("provider-anchor-stale-context");
    expect(classifyHarnessFailure({ evidence: ["provider-anchor-conflict:kind:overlapping-hunks"] }).failureClass)
      .toBe("provider-anchor-conflict");
    expect(classifyHarnessFailure({ evidence: ["provider-anchoring-result:status:unsupported-fuzzy-or-broad-output"] }).failureClass)
      .toBe("provider-anchor-unsupported-fuzzy-output");
    expect(classifyHarnessFailure({ evidence: ["provider-anchor-candidate:unsupported:unsafe provider output"] }).failureClass)
      .toBe("provider-anchor-unsafe-output");
    expect(classifyHarnessFailure({ evidence: ["provider-anchor-candidate:unsupported:malformed provider output"] }).failureClass)
      .toBe("provider-anchor-malformed-output");
  });

  it("classifies anchored provider smoke failures and no-write exact readiness", () => {
    expect(classifyHarnessFailure({ status: "smoke no opt-in" }).failureClass).toBe("smoke-no-opt-in");
    expect(classifyHarnessFailure({ evidence: ["anchored-provider-smoke-gate:skip-reason:provider-not-configured"] }).failureClass)
      .toBe("smoke-provider-unavailable");
    expect(classifyHarnessFailure({ status: "smoke prompt audit failed" }).failureClass).toBe("smoke-prompt-audit-failed");
    expect(classifyHarnessFailure({ status: "smoke output invalid" }).failureClass).toBe("smoke-output-invalid");
    expect(classifyHarnessFailure({ status: "smoke unsafe output", evidence: ["provider-output-validation:status:unsafe-output"] }).failureClass)
      .toBe("smoke-unsafe-output");
    expect(classifyHarnessFailure({ status: "smoke exact-ready no-write" }).failureClass).toBe("smoke-exact-ready-no-write");
    expect(classifyHarnessFailure({ status: "smoke corpus regression" }).failureClass).toBe("smoke-corpus-regression");
    expect(classifyHarnessFailure({ status: "smoke anchoring failed" }).failureClass).toBe("smoke-anchoring-failed");
  });
});
