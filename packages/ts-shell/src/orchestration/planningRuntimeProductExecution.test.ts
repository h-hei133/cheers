import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { buildPlanningMutationHandoffProjection } from "./planningMutationHandoffProjection.js";
import { buildPlanningRuntimeProductProofInputs } from "./planningRuntimeProductExecution.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("buildPlanningRuntimeProductProofInputs", () => {
  it("keeps the default product path review-only with no execution authority", () => {
    const workspaceRoot = createWorkspace({
      "src/planning/targetRanking.ts": sourceContent(),
    });

    const result = buildPlanningRuntimeProductProofInputs({
      workspaceRoot,
      handoff: readyHandoff(),
    });

    expect(result.confirmation).toBeUndefined();
    expect(result.rawProposal).toBeUndefined();
    expect(result.workspace).toBeUndefined();
    expect(result.confirmationState).toBe("not-confirmed");
    expect(result.exactProposalState).toBe("missing");
    expect(result.controlledWorkspaceState).toBe("missing");
    expect(result.executionEvidence).toEqual(
      expect.arrayContaining([
        "planning-runtime-product:confirmation:not-confirmed",
        "planning-runtime-product:exact-proposal:missing",
        "planning-runtime-product:controlled-workspace:missing",
        "planning-runtime-product:confirmation-from-prompt:false",
        "planning-runtime-product:provider-call-during-confirmation:false",
        "planning-runtime-product:command-dispatch-during-confirmation:false",
      ]),
    );
  });

  it("builds controlled temp workspace proof inputs from explicit confirmation and exact proposal", () => {
    const workspaceRoot = createWorkspace({
      "src/planning/targetRanking.ts": sourceContent(),
    });

    const result = buildPlanningRuntimeProductProofInputs({
      workspaceRoot,
      handoff: readyHandoff(),
      execution: {
        confirmation: { state: "trusted-confirmed" },
        rawProposal: exactProposal(),
        controlledWorkspace: {
          scope: "controlled-temp-workspace",
          source: "runtime-option",
        },
      },
    });

    expect(result.confirmation).toEqual({ state: "trusted-confirmed" });
    expect(result.rawProposal).toEqual(exactProposal());
    expect(result.workspace?.scope).toBe("controlled-temp-workspace");
    expect(result.currentContentByTargetPath?.get("src/planning/targetRanking.ts")).toBe(
      sourceContent(),
    );
    expect(result.expectedContentByTargetPath?.get("src/planning/targetRanking.ts")).toBe(
      expectedContent(),
    );
    expect(result.readVerifiedFile?.("src/planning/targetRanking.ts")).toBe(sourceContent());
    expect(result.controlledWorkspaceState).toBe("trusted-controlled-temp-workspace");
    expect(result.executionEvidence).toEqual(
      expect.arrayContaining([
        "planning-runtime-product:confirmation:trusted-confirmed",
        "planning-runtime-product:exact-proposal:provided",
        "planning-runtime-product:controlled-workspace:trusted-controlled-temp-workspace",
      ]),
    );
  });

  it("rejects explicit controlled authority outside temp or configured test roots", () => {
    const workspaceRoot = path.join(
      path.parse(process.cwd()).root,
      "private-agents-route210-not-temp",
    );

    const result = buildPlanningRuntimeProductProofInputs({
      workspaceRoot,
      handoff: readyHandoff(),
      execution: {
        confirmation: { state: "trusted-confirmed" },
        rawProposal: exactProposal(),
        controlledWorkspace: {
          scope: "controlled-temp-workspace",
          source: "runtime-option",
        },
      },
    });

    expect(result.workspace).toBeUndefined();
    expect(result.controlledWorkspaceState).toBe("rejected");
    expect(result.executionEvidence).toContain(
      "planning-runtime-product:controlled-workspace:rejected",
    );
  });
});

function readyHandoff() {
  return buildPlanningMutationHandoffProjection({
    editTargets: [
      {
        path: "src/planning/targetRanking.ts",
        rationale: "repo score 99; primary-source-name-match",
        handoffRoute: "existing-proof-carrying-mutation-runtime",
        readiness: "ready-for-review",
      },
    ],
    missingFacts: [],
    taskKind: "edit-file",
    verificationIntentAvailable: true,
  });
}

function exactProposal() {
  return {
    operationKind: "exact-fenced-replacement" as const,
    targets: [
      {
        path: "src/planning/targetRanking.ts",
        oldText: "  return task.includes('planner') ? 'targetRanking.ts' : 'unknown';",
        newText: "  return task.trim().includes('planner') ? 'targetRanking.ts' : 'unknown';",
      },
    ],
    verificationPlan: ["readback verifies controlled fixture final content"],
  };
}

function createWorkspace(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "route210-product-exec-"));
  tempRoots.push(root);
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content, "utf8");
  }
  return root;
}

function sourceContent(): string {
  return [
    "export function rankPlannerTargets(task: string) {",
    "  return task.includes('planner') ? 'targetRanking.ts' : 'unknown';",
    "}",
    "",
  ].join("\n");
}

function expectedContent(): string {
  return [
    "export function rankPlannerTargets(task: string) {",
    "  return task.trim().includes('planner') ? 'targetRanking.ts' : 'unknown';",
    "}",
    "",
  ].join("\n");
}
