import { describe, expect, it } from "vitest";

import { executeVerification, verifyChangedFileCoverage } from "./model.js";

describe("verification execution model", () => {
  it("passes after post-repair validation while keeping truth non-terminal", () => {
    const execution = executeVerification({
      selection: {
        purpose: "debug-repair",
        state: "selected-failed",
        selected: true,
        whySelected: "debug check",
        proves: [],
        doesNotProve: [],
        blockers: ["verification failed"],
        fallback: "repair",
        evidenceInputEligible: false,
        resultInputEligible: false,
        terminalSuccessClaim: false,
      },
      strategy: {
        state: "ready",
        actions: ["repair", "verify"],
        blockers: [],
        terminalSuccessClaim: false,
      },
      repairAction: {
        attempted: true,
        postValidation: "passed",
        blockers: [],
        originalFailurePreserved: true,
        terminalSuccessClaim: false,
      },
      contextReady: true,
    });

    expect(execution).toMatchObject({
      state: "passed",
      evidenceInputEligible: true,
      resultInputEligible: true,
      terminalSuccessClaim: false,
    });
  });

  it("keeps selected but not run verification partial until complete proof exists", () => {
    const execution = executeVerification({
      selection: {
        purpose: "continuation",
        state: "selected-not-run",
        selected: true,
        whySelected: "freshness",
        proves: [],
        doesNotProve: [],
        blockers: ["verification selected but not run"],
        fallback: "rerun",
        evidenceInputEligible: false,
        resultInputEligible: false,
        terminalSuccessClaim: false,
      },
      strategy: {
        state: "ready",
        actions: ["continue", "verify"],
        nextAction: "verify",
        blockers: [],
        terminalSuccessClaim: false,
      },
      contextReady: true,
    });

    expect(execution.state).toBe("partial");
    expect(execution.evidenceInputEligible).toBe(false);
  });

  it("keeps changed-file verification partial until targeted rerun proof exists", () => {
    const execution = executeVerification({
      selection: {
        purpose: "code-edit",
        state: "selected-not-run",
        selected: true,
        whySelected: "focused changed-file check",
        proves: [],
        doesNotProve: [],
        blockers: ["verification selected but not run"],
        fallback: "run selected check",
        evidenceInputEligible: false,
        resultInputEligible: false,
        terminalSuccessClaim: false,
      },
      strategy: {
        state: "ready",
        actions: ["verify"],
        nextAction: "verify",
        blockers: [],
        terminalSuccessClaim: false,
      },
      changedFiles: ["src/parser.ts"],
      contextReady: true,
    });

    expect(execution).toMatchObject({
      state: "partial",
      blockers: ["verification rerun required for complete proof"],
      evidenceInputEligible: false,
    });
  });

  it("requires every changed target to be covered by verification proof", () => {
    const coverage = verifyChangedFileCoverage({
      changedFiles: ["src/source.ts", "src/dependent.ts"],
      verifiedFiles: ["src/source.ts"],
      unverifiedFiles: ["src/dependent.ts"],
      verificationState: "passed",
    });

    expect(coverage).toEqual({
      complete: false,
      coveredFiles: ["src/source.ts"],
      missingFiles: ["src/dependent.ts"],
    });
  });

  it("requires impacted verification targets to be covered with changed files", () => {
    const coverage = verifyChangedFileCoverage({
      changedFiles: ["src/status.ts"],
      verificationTargets: ["src/status.test.ts"],
      verifiedFiles: ["src/status.ts"],
      verificationState: "passed",
    });

    expect(coverage).toEqual({
      complete: false,
      coveredFiles: ["src/status.ts"],
      missingFiles: ["src/status.test.ts"],
    });
  });

  it("keeps verification incomplete when changed files are only present as selected targets", () => {
    const coverage = verifyChangedFileCoverage({
      changedFiles: ["src/source.ts", "src/dependent.ts"],
      verificationTargets: ["src/source.ts", "src/dependent.ts", "src/source.test.ts"],
      verifiedFiles: ["src/source.test.ts"],
      verificationState: "passed",
    });

    expect(coverage).toEqual({
      complete: false,
      coveredFiles: ["src/source.test.ts"],
      missingFiles: ["src/source.ts", "src/dependent.ts"],
    });
  });

  it("does not let a global pass hide an unverified dependent impacted target", () => {
    const coverage = verifyChangedFileCoverage({
      changedFiles: ["src/status/contract.ts", "src/orders/statusRenderer.ts"],
      verificationTargets: ["src/orders/statusRenderer.test.ts"],
      verifiedFiles: ["src/status/contract.ts"],
      verificationState: "passed",
    });

    expect(coverage).toEqual({
      complete: false,
      coveredFiles: ["src/status/contract.ts"],
      missingFiles: ["src/orders/statusRenderer.ts", "src/orders/statusRenderer.test.ts"],
    });
  });
});
