import { describe, expect, it } from "vitest";

import { executeVerification } from "./model.js";

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
});
