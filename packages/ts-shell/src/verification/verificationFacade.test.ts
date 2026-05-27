import { describe, expect, it } from "vitest";

import { projectVerificationReceipt } from "./verificationFacade.js";

describe("verificationFacade", () => {
  it("projects fully covered dispatched success as verified", () => {
    const receipt = projectVerificationReceipt({
      selectedCommand:
        "npm test -w packages/ts-shell -- src/verification/taskRelevantVerificationRoute.test.ts",
      authority: "explicitly-approved",
      dispatchStatus: "dispatched",
      runtimeStatus: "success",
      relevanceStatus: "relevant",
      coverageStatus: "covered",
      coveredFiles: ["packages/ts-shell/src/verification/taskRelevantVerificationRoute.ts"],
      uncoveredFiles: [],
      notProvenClaims: [],
      verdictStatus: "verified",
    });

    expect(receipt.verdict.status).toBe("COMPLETE");
    expect(receipt.mutationDuringVerification).toBe("not-run");
    expect(receipt.providerCallDuringVerification).toBe("not-run");
  });

  it("does not treat selected-but-not-run as success", () => {
    const receipt = projectVerificationReceipt({
      selectedCommand:
        "npm test -w packages/ts-shell -- src/verification/taskRelevantVerificationRoute.test.ts",
      authority: "not-granted",
      dispatchStatus: "not-run",
      runtimeStatus: "not-run",
      relevanceStatus: "relevant",
      coverageStatus: "covered",
      coveredFiles: ["packages/ts-shell/src/verification/taskRelevantVerificationRoute.ts"],
      uncoveredFiles: [],
      notProvenClaims: ["selected command dispatch", "runtime receipt"],
      verdictStatus: "approval-required",
    });

    expect(receipt.verdict.status).toBe("NOT_PROVEN");
    expect(receipt.selectedNotRunIsSuccess).toBe(false);
    expect(receipt.notProvenClaims).toContain("selected command dispatch");
  });

  it("does not let partial coverage or unrelated commands prove task success", () => {
    const receipt = projectVerificationReceipt({
      selectedCommand: "node --version",
      authority: "explicitly-approved",
      dispatchStatus: "dispatched",
      runtimeStatus: "success",
      relevanceStatus: "unrelated",
      coverageStatus: "partially-covered",
      coveredFiles: ["packages/ts-shell/src/a.ts"],
      uncoveredFiles: ["packages/ts-shell/src/b.ts"],
      notProvenClaims: ["full changed-file verification coverage"],
      verdictStatus: "insufficient-evidence",
    });

    expect(receipt.verdict.status).toBe("NOT_PROVEN");
    expect(receipt.oneFileSuccessCanHideAnotherFailure).toBe(false);
    expect(receipt.uncoveredFiles).toEqual(["packages/ts-shell/src/b.ts"]);
  });
});
