import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { buildPlanningMutationHandoffProjection } from "./planningMutationHandoffProjection.js";
import { buildPlanningMutationProposalBridge } from "./planningMutationProposalBridge.js";
import { runPlanningMutationProofHandoff } from "./planningMutationProofHandoff.js";
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

describe("runPlanningMutationProofHandoff", () => {
  it("keeps exact-ready planning bridges no-write until trusted confirmation", async () => {
    const fixture = createFixture({ [targetPath]: sourceContent });
    const bridge = exactBridge(readFile(fixture.workspaceRoot, targetPath));

    const result = await runPlanningMutationProofHandoff({
      bridge,
      workspace: {
        scope: "controlled-temp-workspace",
        fencedOptions: fixture.options,
        targetSetOptions: fixture.options,
      },
    });

    expect(bridge.state).toBe("confirmation-required");
    expect(bridge.anchoredMappingByHunkId?.size).toBe(1);
    expect(result.state).toBe("confirmation-required");
    expect(result.backendLane).toBe("not-run");
    expect(result.applyState).toBe("not-run");
    expect(result.changedFiles).toEqual([]);
    expect(result.providerCallDuringApply).toBe(false);
    expect(result.planningMutationAuthority).toBe("not-granted");
    expect(readFile(fixture.workspaceRoot, targetPath)).toBe(sourceContent);
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        "planning-mutation-proof-handoff:explicit-confirmation-required",
        "edit-proposal-selection:explicit-confirmation-required",
        "planning-mutation-proof-handoff:apply:not-run",
        "planning-mutation-proof-handoff:no-provider-call-during-apply",
      ]),
    );
  });

  it("hands trusted exact bridges to the existing fenced proof backend in a controlled workspace", async () => {
    const fixture = createFixture({ [targetPath]: sourceContent });
    const bridge = exactBridge(readFile(fixture.workspaceRoot, targetPath));

    const result = await runPlanningMutationProofHandoff({
      bridge,
      confirmation: { state: "trusted-confirmed" },
      workspace: {
        scope: "controlled-temp-workspace",
        fencedOptions: fixture.options,
        targetSetOptions: fixture.options,
      },
    });

    expect(result.state).toBe("applied");
    expect(result.backendLane).toBe("existing-proof-carrying-mutation-backend");
    expect(result.selectionState).toBe("confirmed-exact-single-target");
    expect(result.applyState).toBe("single-target-applied");
    expect(result.verificationState).toBe("not-run");
    expect(result.changedFiles).toEqual([targetPath]);
    expect(result.providerCallDuringApply).toBe(false);
    expect(result.planningMutationAuthority).toBe("not-granted");
    expect(readFile(fixture.workspaceRoot, targetPath)).toBe(expectedContent);
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        "planning-mutation-proof-handoff:existing-backend-consumed",
        "edit-proposal-apply:existing-fenced-route",
        "fenced-edit-route:exact-replacement-written",
        "planning-mutation-proof-handoff:no-new-writer",
        "planning-mutation-proof-handoff:no-fuzzy-apply",
        "planning-mutation-proof-handoff:no-provider-call-during-apply",
        "planning-mutation-proof-handoff:verification:not-run",
      ]),
    );
  });

  it("hands trusted exact multi-file bridges to the existing target-set backend", async () => {
    const fixture = createFixture({
      "src/a.ts": "status: draft\n",
      "src/b.ts": "status: draft\n",
    });
    const bridge = exactBridgeFor({
      targets: ["src/a.ts", "src/b.ts"],
      currentContentByTargetPath: new Map([
        ["src/a.ts", "status: draft\n"],
        ["src/b.ts", "status: draft\n"],
      ]),
      replacements: [
        { path: "src/a.ts", oldText: "status: draft", newText: "status: ready" },
        { path: "src/b.ts", oldText: "status: draft", newText: "status: ready" },
      ],
    });

    const result = await runPlanningMutationProofHandoff({
      bridge,
      confirmation: { state: "trusted-confirmed" },
      workspace: {
        scope: "controlled-temp-workspace",
        fencedOptions: fixture.options,
        targetSetOptions: fixture.options,
      },
    });

    expect(result.state).toBe("applied");
    expect(result.selectionState).toBe("confirmed-exact-target-set");
    expect(result.applyState).toBe("target-set-applied");
    expect(result.workspaceScope).toBe("controlled-temp-workspace");
    expect(result.changedFiles).toEqual(["src/a.ts", "src/b.ts"]);
    expect(readFile(fixture.workspaceRoot, "src/a.ts")).toBe("status: ready\n");
    expect(readFile(fixture.workspaceRoot, "src/b.ts")).toBe("status: ready\n");
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        "planning-mutation-proof-handoff:existing-backend-consumed",
        "edit-proposal-apply:existing-target-set-route",
        "target-set-edit-route:reuse-existing-fenced-lane",
        "edit-proposal-apply:no-provider-call",
      ]),
    );
  });

  it("hands trusted distinct exact hunks to the existing hunk-set backend", async () => {
    const fixture = createFixture({
      "src/a.ts": "status: draft\n",
      "src/b.ts": "state: draft\n",
    });
    const bridge = exactBridgeFor({
      targets: ["src/a.ts", "src/b.ts"],
      currentContentByTargetPath: new Map([
        ["src/a.ts", "status: draft\n"],
        ["src/b.ts", "state: draft\n"],
      ]),
      replacements: [
        { path: "src/a.ts", oldText: "status: draft", newText: "status: ready" },
        { path: "src/b.ts", oldText: "state: draft", newText: "state: ready" },
      ],
    });

    const result = await runPlanningMutationProofHandoff({
      bridge,
      confirmation: { state: "trusted-confirmed" },
      workspace: {
        scope: "controlled-temp-workspace",
        fencedOptions: fixture.options,
        targetSetOptions: fixture.options,
      },
    });

    expect(result.state).toBe("applied");
    expect(result.selectionState).toBe("confirmed-exact-target-set");
    expect(result.applyState).toBe("hunk-set-applied");
    expect(result.changedFiles).toEqual(["src/a.ts", "src/b.ts"]);
    expect(readFile(fixture.workspaceRoot, "src/a.ts")).toBe("status: ready\n");
    expect(readFile(fixture.workspaceRoot, "src/b.ts")).toBe("state: ready\n");
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        "planning-mutation-proof-handoff:existing-backend-consumed",
        "edit-proposal-apply:hunk-set-route",
        "proposal-hunk-set-route:reuse-existing-fenced-lane",
        "proposal-hunk-set-route:no-new-writer",
        "proposal-hunk-set-route:no-provider-call",
      ]),
    );
  });

  it("requires controlled workspace authority even after trusted confirmation", async () => {
    const bridge = exactBridge(sourceContent);

    const result = await runPlanningMutationProofHandoff({
      bridge,
      confirmation: { state: "trusted-confirmed" },
    });

    expect(result.state).toBe("stopped");
    expect(result.backendLane).toBe("not-run");
    expect(result.applyState).toBe("not-run");
    expect(result.controlledWriteAuthority).toBe("required");
    expect(result.changedFiles).toEqual([]);
    expect(result.evidence).toContain(
      "planning-mutation-proof-handoff:controlled-workspace-required",
    );
  });

  it("stops before apply when controlled workspace authority roots disagree", async () => {
    const fixture = createFixture({ [targetPath]: sourceContent });
    const otherFixture = createFixture({ [targetPath]: sourceContent });
    const bridge = exactBridge(readFile(fixture.workspaceRoot, targetPath));

    const result = await runPlanningMutationProofHandoff({
      bridge,
      confirmation: { state: "trusted-confirmed" },
      workspace: {
        scope: "controlled-temp-workspace",
        fencedOptions: fixture.options,
        targetSetOptions: otherFixture.options,
      },
    });

    expect(result.state).toBe("stopped");
    expect(result.backendLane).toBe("not-run");
    expect(result.applyState).toBe("not-run");
    expect(result.changedFiles).toEqual([]);
    expect(readFile(fixture.workspaceRoot, targetPath)).toBe(sourceContent);
    expect(readFile(otherFixture.workspaceRoot, targetPath)).toBe(sourceContent);
    expect(result.evidence).toContain(
      "planning-mutation-proof-handoff:workspace-root-mismatch",
    );
  });

  it("does not run the backend for unsupported or non-exact bridge states", async () => {
    const fixture = createFixture({ [targetPath]: sourceContent });
    const bridge = buildPlanningMutationProposalBridge({
      requestId: "route209-proof-unsupported",
      handoff: readyHandoff(),
      rawProposal: {
        operationKind: "broad-refactor",
        targets: [
          {
            path: targetPath,
            oldText: "rankTarget(task)",
            newText: "rankEveryTarget(task)",
          },
        ],
      },
      currentContentByTargetPath: new Map([[targetPath, sourceContent]]),
    });

    const result = await runPlanningMutationProofHandoff({
      bridge,
      confirmation: { state: "trusted-confirmed" },
      workspace: {
        scope: "controlled-temp-workspace",
        fencedOptions: fixture.options,
        targetSetOptions: fixture.options,
      },
    });

    expect(bridge.state).toBe("unsupported");
    expect(result.state).toBe("unsupported");
    expect(result.backendLane).toBe("not-run");
    expect(result.applyState).toBe("not-run");
    expect(result.changedFiles).toEqual([]);
    expect(readFile(fixture.workspaceRoot, targetPath)).toBe(sourceContent);
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        "planning-mutation-proof-handoff:bridge-not-exact-ready",
        "planning-mutation-proof-handoff:apply:not-run",
        "planning-mutation-proof-handoff:no-provider-call-during-apply",
      ]),
    );
  });
});

function exactBridge(currentContent: string) {
  return exactBridgeFor({
    targets: [targetPath],
    currentContentByTargetPath: new Map([[targetPath, currentContent]]),
    replacements: [
      {
        path: targetPath,
        oldText: "  return rankTarget(task);",
        newText: "  return rankTarget(task.trim());",
      },
    ],
  });
}

function exactBridgeFor(input: {
  readonly targets: readonly string[];
  readonly currentContentByTargetPath: ReadonlyMap<string, string>;
  readonly replacements: readonly {
    readonly path: string;
    readonly oldText: string;
    readonly newText: string;
  }[];
}) {
  return buildPlanningMutationProposalBridge({
    requestId: `route209-proof-exact-${input.targets.join("-")}`,
    handoff: readyHandoffForTargets(input.targets),
    rawProposal: {
      operationKind: "exact-fenced-replacement",
      targets: input.replacements,
      verificationPlan: ["readback verifies the controlled fixture"],
    },
    currentContentByTargetPath: input.currentContentByTargetPath,
  });
}

function readyHandoff() {
  return readyHandoffForTargets([targetPath]);
}

function readyHandoffForTargets(targets: readonly string[]) {
  return buildPlanningMutationHandoffProjection({
    editTargets: targets.map((target) => ({
      path: target,
      rationale: "repo score 99; primary-source-name-match",
      handoffRoute: "existing-proof-carrying-mutation-runtime",
      readiness: "ready-for-review",
    })),
    missingFacts: [],
    taskKind: "edit-file",
    verificationIntentAvailable: true,
    contextReceipts: targets.map((target, index) => ({
      id: `context-receipt:ctx_mem_${index}:1`,
      path: target,
      summary: "context engine source summary",
      relevance: "target file",
    })),
    readEvidence: targets.map((target, index) => ({
      id: `read-evidence:context_engine_${index}:1`,
      path: target,
      reason: "target file",
      source: "repo-intelligence",
    })),
    expectedChangeSummary: `Prepare a review-only proposal for ${targets.join(", ")}.`,
    verificationIntentSummary: "verificationPlan=verification_plan_123; command=npm test -- --help; command-dispatch=not-run",
    verificationEvidenceIds: ["verification_plan_123"],
  });
}

function createFixture(files: Record<string, string>) {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "route209-proof-"));
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
