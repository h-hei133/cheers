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
});
