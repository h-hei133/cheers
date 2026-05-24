import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { buildPlanningMutationHandoffProjection } from "./planningMutationHandoffProjection.js";
import { runPlanningMutationProofRoute } from "./planningMutationProofRoute.js";
import { createWorkspaceWriteAuthority } from "./patchResult/workspaceAuthority.js";

const tempRoots: string[] = [];
const targetPath = "src/contextEngine.ts";
const sourceContent = [
  "export function run(task: string) {",
  "  return rankTarget(task);",
  "}",
  "",
].join("\n");
const expectedContent = [
  "export function run(task: string) {",
  "  return rankTarget(task.trim());",
  "}",
  "",
].join("\n");

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("runPlanningMutationProofRoute", () => {
  it("keeps the default product handoff no-write and exposes a Claim Ledger terminal", async () => {
    const route = await runPlanningMutationProofRoute({
      requestId: "route209-proof-route-default",
      handoff: readyHandoff(),
      taskKind: "edit-file",
    });

    expect(route.state).toBe("proposal-prepared");
    expect(route.bridge.state).toBe("proposal-prepared");
    expect(route.proofHandoff.backendLane).toBe("not-run");
    expect(route.proofHandoff.applyState).toBe("not-run");
    expect(route.verification.verificationState).toBe("not-run");
    expect(route.changedFiles).toEqual([]);
    expect(route.liveSuccess).toBe(false);
    expect(route.runtimeOutcome.codingResult.changedFiles).toEqual([]);
    expect(route.runtimeOutcome.codingResult.verification.status).toBe("skipped");
    expect(route.runtimeOutcome.userFacingOutput).toContain("Planning mutation proof route");
    expect(route.runtimeOutcome.userFacingOutput).toContain("Claim terminal:");
    expect(route.evidence).toEqual(
      expect.arrayContaining([
        "planning-mutation-proof-route:state:proposal-prepared",
        "planning-mutation-proof-route:provider-call-during-apply:false",
        "planning-proposal-bridge:proposal-review-consumed",
        "planning-mutation-proof-handoff:bridge-not-exact-ready",
        "planning-mutation-proof-verification:provider-call-during-apply:false",
      ]),
    );
  });

  it("composes proposal anchoring, existing backend apply, readback, and Claim Ledger output", async () => {
    const fixture = createFixture({ [targetPath]: sourceContent });

    const route = await runPlanningMutationProofRoute({
      requestId: "route209-proof-route-verified",
      handoff: readyHandoff(),
      rawProposal: exactProposal(),
      currentContentByTargetPath: new Map([[targetPath, readFile(fixture.workspaceRoot, targetPath)]]),
      confirmation: { state: "trusted-confirmed" },
      workspace: {
        scope: "controlled-temp-workspace",
        fencedOptions: fixture.options,
        targetSetOptions: fixture.options,
      },
      readVerifiedFile: fixture.options.readVerifiedFile,
      expectedContentByTargetPath: new Map([[targetPath, expectedContent]]),
      providerCalled: true,
      taskKind: "edit-file",
    });

    expect(readFile(fixture.workspaceRoot, targetPath)).toBe(expectedContent);
    expect(route.state).toBe("verified");
    expect(route.bridge.state).toBe("confirmation-required");
    expect(route.proofHandoff.backendLane).toBe("existing-proof-carrying-mutation-backend");
    expect(route.proofHandoff.applyState).toBe("single-target-applied");
    expect(route.verification.verificationState).toBe("succeeded");
    expect(route.terminalState).toBe("verification-succeeded-not-live");
    expect(route.terminalResult).toBe("verification-succeeded");
    expect(route.liveSuccess).toBe(false);
    expect(route.changedFiles).toEqual([targetPath]);
    expect(route.verifiedFiles).toEqual([targetPath]);
    expect(route.runtimeOutcome.codingResult.verification.status).toBe("passed");
    expect(route.runtimeOutcome.codingResult.taskSatisfaction.verdict).toBe("completed-with-caveats");
    expect(route.output).toContain("Claim terminal: verification-succeeded-not-live");
    expect(route.evidence).toEqual(
      expect.arrayContaining([
        "planning-mutation-proof-route:state:verified",
        "planning-mutation-proof-handoff:existing-backend-consumed",
        "planning-mutation-proof-verification:state:verified",
        "claim-ledger:terminal:verification-succeeded-not-live",
        "claim-ledger:live-success:false",
      ]),
    );
  });

  it("does not turn applied backend output into success before readback", async () => {
    const fixture = createFixture({ [targetPath]: sourceContent });

    const route = await runPlanningMutationProofRoute({
      requestId: "route209-proof-route-applied-unverified",
      handoff: readyHandoff(),
      rawProposal: exactProposal(),
      currentContentByTargetPath: new Map([[targetPath, readFile(fixture.workspaceRoot, targetPath)]]),
      confirmation: { state: "trusted-confirmed" },
      workspace: {
        scope: "controlled-temp-workspace",
        fencedOptions: fixture.options,
        targetSetOptions: fixture.options,
      },
      providerCalled: true,
      taskKind: "edit-file",
    });

    expect(route.state).toBe("applied-unverified");
    expect(route.proofHandoff.applyState).toBe("single-target-applied");
    expect(route.verification.verificationState).toBe("not-run");
    expect(route.terminalState).toBe("apply-succeeded");
    expect(route.terminalResult).toBe("apply-succeeded");
    expect(route.runtimeOutcome.codingResult.verification.status).toBe("skipped");
    expect(route.runtimeOutcome.codingResult.taskSatisfaction.verdict).toBe("insufficient-evidence");
    expect(route.evidence).toEqual(
      expect.arrayContaining([
        "planning-mutation-proof-route:state:applied-unverified",
        "claim-ledger:not-proven:verification:verification-not-run",
      ]),
    );
  });

  it("projects readback failure as repair-ready rather than success", async () => {
    const fixture = createFixture({ [targetPath]: sourceContent });

    const route = await runPlanningMutationProofRoute({
      requestId: "route209-proof-route-repair-ready",
      handoff: readyHandoff(),
      rawProposal: exactProposal(),
      currentContentByTargetPath: new Map([[targetPath, readFile(fixture.workspaceRoot, targetPath)]]),
      confirmation: { state: "trusted-confirmed" },
      workspace: {
        scope: "controlled-temp-workspace",
        fencedOptions: fixture.options,
        targetSetOptions: fixture.options,
      },
      readVerifiedFile: () => sourceContent,
      expectedContentByTargetPath: new Map([[targetPath, expectedContent]]),
      providerCalled: true,
      taskKind: "edit-file",
    });

    expect(route.state).toBe("repair-ready");
    expect(route.verification.verificationState).toBe("failed");
    expect(route.terminalState).toBe("repair-eligible");
    expect(route.runtimeOutcome.codingResult.verification.status).toBe("failed");
    expect(route.runtimeOutcome.codingResult.failedFiles).toEqual([
      { path: targetPath, reason: route.verification.reason },
    ]);
    expect(route.evidence).toEqual(
      expect.arrayContaining([
        "planning-mutation-proof-route:state:repair-ready",
        `planning-mutation-proof-verification:file:${targetPath}:expected-content:mismatch`,
        "claim-ledger:terminal:repair-eligible",
      ]),
    );
  });
});

function readyHandoff() {
  return buildPlanningMutationHandoffProjection({
    editTargets: [
      {
        path: targetPath,
        rationale: "repo score 99; primary-source-name-match",
        handoffRoute: "existing-proof-carrying-mutation-runtime",
        readiness: "ready-for-review",
      },
    ],
    missingFacts: [],
    taskKind: "edit-file",
    verificationIntentAvailable: true,
    contextReceipts: [
      {
        id: "context-receipt:ctx_mem_123:1",
        path: targetPath,
        summary: "context engine source summary",
        relevance: "target file",
      },
    ],
    readEvidence: [
      {
        id: "read-evidence:context_engine_123:1",
        path: targetPath,
        reason: "target file",
        source: "repo-intelligence",
      },
    ],
    expectedChangeSummary: `Prepare a review-only proposal for ${targetPath}.`,
    verificationIntentSummary: "verificationPlan=verification_plan_123; command=npm test -- --help; command-dispatch=not-run",
    verificationEvidenceIds: ["verification_plan_123"],
  });
}

function exactProposal() {
  return {
    operationKind: "exact-fenced-replacement" as const,
    targets: [
      {
        path: targetPath,
        oldText: "  return rankTarget(task);",
        newText: "  return rankTarget(task.trim());",
      },
    ],
    verificationPlan: ["readback verifies the controlled fixture"],
  };
}

function createFixture(files: Record<string, string>) {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "route209-proof-route-"));
  tempRoots.push(workspaceRoot);
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(workspaceRoot, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content, "utf8");
  }
  const authority = createWorkspaceWriteAuthority(workspaceRoot);
  return {
    workspaceRoot,
    options: {
      workspaceRoot,
      explicitRuntimeOptIn: true,
      explicitWorkspaceWriteOptIn: true,
      requestedUserDecision: "approved" as const,
      defaultProductionRejectionUnchanged: true as const,
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      validateWriteTarget: authority.validateWriteTarget,
      writeFile: authority.writeFile,
    },
  };
}

function readFile(workspaceRoot: string, relativePath: string): string {
  return fs.readFileSync(path.join(workspaceRoot, relativePath), "utf8");
}
