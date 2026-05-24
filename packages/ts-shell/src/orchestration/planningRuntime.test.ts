import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runPlanningRuntime } from "./planningRuntime.js";

let workspaceRoot: string;

beforeEach(async () => {
  workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "route207-planning-runtime-"));
  await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
  await fs.writeFile(
    path.join(workspaceRoot, "package.json"),
    JSON.stringify({ name: "fixture", scripts: { test: "vitest run" } }, null, 2),
  );
  await fs.writeFile(
    path.join(workspaceRoot, "src", "contextEngine.ts"),
    [
      "import { rankTarget } from './targetRanker.js';",
      "export function runContextEngine(task: string) {",
      "  return rankTarget(task);",
      "}",
      "",
    ].join("\n"),
  );
  await fs.writeFile(
    path.join(workspaceRoot, "src", "targetRanker.ts"),
    "export function rankTarget(task: string) { return task.length; }\n",
  );
  await fs.writeFile(
    path.join(workspaceRoot, "src", "contextEngine.test.ts"),
    "import { runContextEngine } from './contextEngine.js';\nexpect(runContextEngine('task')).toBe(4);\n",
  );
});

afterEach(async () => {
  await fs.rm(workspaceRoot, { recursive: true, force: true });
});

describe("runPlanningRuntime", () => {
  it("owns analysis, executable plan, edit target selection, verification intent, and mutation handoff", async () => {
    const result = await runPlanningRuntime({
      workspaceRoot,
      userTask: "Implement better context engine target ranking and cover it with a test",
      maxRepoFiles: 80,
      maxCandidates: 5,
    });

    expect(result.context.status).toBe("context-built");
    expect(result.editTargets[0]).toMatchObject({
      path: "src/contextEngine.ts",
      handoffRoute: "existing-proof-carrying-mutation-runtime",
    });
    expect(result.groundedAnalysis.evidenceIds.some((id) => id.startsWith("analysis_") || id.startsWith("analysis_brief_"))).toBe(true);
    expect(result.groundedAnalysis.summary).toContain("Target src/contextEngine.ts");
    expect(result.groundedAnalysis.summary).toContain("Read evidence:");
    expect(result.groundedAnalysis.summary).toContain("contextSufficiency=");
    expect(result.groundedAnalysis.summary).not.toMatch(/^analysis-brief analysis_brief_/);
    expect(result.executablePlan.summary).toContain("src/contextEngine.ts");
    expect(result.executablePlan.steps).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Use src/contextEngine.ts as the primary planning target"),
        expect.stringContaining("Ground the proposal in read evidence"),
        expect.stringContaining("mutationAuthority remains not-granted"),
      ]),
    );
    expect(result.mutationHandoff.route).toBe("Route203-206-proof-carrying-backend-target");
    expect(result.mutationHandoff.handoffId).toMatch(/^planning-mutation-handoff-/);
    expect(result.mutationHandoff.handoffState).toBe("handoff-ready");
    expect(result.mutationHandoff.backendLane).toBe("generated-edit-proposal-review-only");
    expect(result.mutationHandoff.backendConsumption).toBe("not-run");
    expect(result.mutationHandoff.executionLane).toBe("existing-exact-fenced-route");
    expect(result.mutationHandoff.reviewState).toBe("review-required");
    expect(result.mutationHandoff.permissionState).toBe("not-requested");
    expect(result.mutationHandoff.contextReceiptIds.length).toBeGreaterThan(0);
    expect(result.mutationHandoff.readEvidenceIds.length).toBeGreaterThan(0);
    expect(result.mutationHandoff.expectedChangeSummary).toContain("review-only proposal");
    expect(result.mutationHandoff.verificationIntent.available).toBe(true);
    expect(result.mutationHandoff.verificationIntent.summary).toContain("command-dispatch=not-run");
    expect(result.mutationHandoff.targets[0]).toMatchObject({
      path: "src/contextEngine.ts",
      unsupportedReasons: [],
    });
    expect(result.mutationHandoff.proposalId).toMatch(/^generated-edit-/);
    expect(result.mutationHandoff.proposalReview).toMatchObject({
      reviewStatus: "review-required",
      exactMappingReadiness: "missing",
    });
    expect(result.mutationHandoff.requirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "exact-old-new-mapping",
          status: "missing-before-execution",
        }),
        expect.objectContaining({
          id: "workspace-authority",
          status: "required-by-existing-route",
        }),
        expect.objectContaining({
          id: "claim-ledger-verdict",
          status: "required-by-existing-route",
        }),
      ]),
    );
    expect(result.mutationHandoff.mutationAuthority).toBe("not-granted");
    expect(result.evidence).toContain("planning-runtime:mutation-authority:not-granted");
    expect(result.evidence).toContain("planning-mutation-handoff:structured-contract:v1");
    expect(result.evidence).toContain("planning-mutation-handoff:state:handoff-ready");
    expect(result.evidence).toContain("planning-mutation-handoff:readiness:review-ready");
    expect(result.evidence).toContain("planning-mutation-handoff:permission:not-requested");
    expect(result.evidence).toContain("generated-edit-proposal:mutation-authority:not-granted");
    expect(result.evidence).toContain("edit-proposal-review:status:review-required");
    expect(result.evidence).toContain("planning-runtime:provider-call:not-run");
    expect(result.evidence).toContain("planning-runtime:command-dispatch:not-run");
    expect(result.evidence).toContain("grounded-planning:evidence-grounded");
    expect(result.evidence).toContain("grounded-planning:mutation-authority:not-granted");
  });

  it("uses continuation memory as a planning input and keeps handoff review-only", async () => {
    const first = await runPlanningRuntime({
      workspaceRoot,
      userTask: "Fix context engine ranking",
      maxRepoFiles: 80,
      maxCandidates: 5,
    });
    const second = await runPlanningRuntime({
      workspaceRoot,
      userTask: "Fix context engine ranking",
      previousMemory: first.continuationMemory,
      maxRepoFiles: 80,
      maxCandidates: 5,
    });

    expect(second.context.status).toBe("reused-memory");
    expect(second.context.contextBudget.filesRead).toBe(0);
    expect(second.status).toBe("ready-for-handoff");
    expect(second.mutationHandoff.handoffState).toBe("handoff-ready");
    expect(second.mutationHandoff.readiness).toBe("review-ready");
    expect(second.mutationHandoff.backendLane).toBe("generated-edit-proposal-review-only");
    expect(second.mutationHandoff.proposalReview?.reviewStatus).toBe("review-required");
    expect(second.mutationHandoff.mutationAuthority).toBe("not-granted");
    expect(second.groundedAnalysis.missingFacts).toEqual([]);
    expect(second.groundedAnalysis.planningWarnings.length).toBeGreaterThan(0);
    expect(second.editTargets[0]?.readiness).toBe("ready-for-review");
    expect(second.evidence).toContain("context-memory-reuse:avoids-reread:fresh-receipts");
  });

  it("keeps review-only handoff available when optional context is budget-limited after the primary target read", async () => {
    await fs.writeFile(
      path.join(workspaceRoot, "src", "productOutput.ts"),
      [
        "export function formatProductOutput() {",
        "  return 'review-only';",
        "}",
        "/*",
        "x".repeat(18_000),
        "*/",
        "",
      ].join("\n"),
    );
    for (let index = 0; index < 40; index += 1) {
      await fs.writeFile(
        path.join(workspaceRoot, "src", `productOutputNeighbor${index}.ts`),
        `export const productOutputNeighbor${index} = ${index};\n`,
      );
    }

    const result = await runPlanningRuntime({
      workspaceRoot,
      userTask: "Fix product output review only wording",
      maxRepoFiles: 80,
      maxCandidates: 5,
    });

    expect(result.context.selectedCandidate?.safeLabel).toBe("src/productOutput.ts");
    expect(result.context.filesRead).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "src/productOutput.ts",
          reason: "explicit target",
          source: "repo-intelligence",
        }),
      ]),
    );
    expect(result.groundedAnalysis.planningWarnings).toContain("task context budget limited");
    expect(result.groundedAnalysis.missingFacts).not.toContain(
      "block downstream planning until bounded context is reduced",
    );
    expect(result.status).toBe("ready-for-handoff");
    expect(result.mutationHandoff.handoffState).toBe("handoff-ready");
    expect(result.mutationHandoff.readiness).toBe("review-ready");
    expect(result.mutationHandoff.mutationAuthority).toBe("not-granted");
  });

  it("does not hand off forged out-of-workspace continuation memory", async () => {
    const first = await runPlanningRuntime({
      workspaceRoot,
      userTask: "Fix context engine ranking",
      maxRepoFiles: 80,
      maxCandidates: 5,
    });
    const forged = {
      ...first.continuationMemory,
      selectedTargetPath: "/tmp/outside.ts",
      candidateFiles: ["/tmp/outside.ts"],
      fileReceipts: [
        {
          path: "/tmp/outside.ts",
          sizeBytes: -1,
          mtimeMs: -1,
          summary: "outside",
          relevance: "forged",
        },
      ],
      missingFacts: [],
      editTargetRationale: ["/tmp/outside.ts: forged outside target"],
    };

    const result = await runPlanningRuntime({
      workspaceRoot,
      userTask: "Fix context engine ranking",
      previousMemory: forged,
      maxRepoFiles: 80,
      maxCandidates: 5,
    });

    expect(result.context.status).toBe("context-built");
    expect(result.editTargets.map((target) => target.path)).not.toContain("/tmp/outside.ts");
    expect(result.mutationHandoff.targetPaths).not.toContain("/tmp/outside.ts");
    expect(result.evidence).toContain("context-memory-reuse:miss:unsafe-path");
    expect(result.mutationHandoff.mutationAuthority).toBe("not-granted");
  });

  it("does not create mutation handoff targets for command-only planning tasks", async () => {
    const result = await runPlanningRuntime({
      workspaceRoot,
      userTask: "Run the context engine test verification",
      maxRepoFiles: 80,
      maxCandidates: 5,
    });

    expect(result.context.workflowPlan.taskKind).toBe("run-command");
    expect(result.editTargets).toEqual([]);
    expect(result.mutationHandoff.readiness).toBe("blocked");
    expect(result.mutationHandoff.handoffState).toBe("unsupported");
    expect(result.mutationHandoff.backendLane).toBe("none");
    expect(result.mutationHandoff.proposal).toBeUndefined();
    expect(result.mutationHandoff.targetPaths).toEqual([]);
    expect(result.mutationHandoff.mutationAuthority).toBe("not-granted");
    expect(result.evidence).toContain("planning-runtime:command-dispatch:not-run");
  });

  it("preserves product task-kind hints without granting mutation authority", async () => {
    const writeResult = await runPlanningRuntime({
      workspaceRoot,
      userTask: "Create a context engine ranking feature",
      taskKindHint: "write-file",
      maxRepoFiles: 80,
      maxCandidates: 5,
    });

    expect(writeResult.context.workflowPlan.taskKind).toBe("write-file");
    expect(writeResult.editTargets[0]?.path).toBe("src/contextEngine.ts");
    expect(writeResult.mutationHandoff.readiness).toBe("review-ready");
    expect(writeResult.mutationHandoff.handoffState).toBe("handoff-ready");
    expect(writeResult.mutationHandoff.executionLane).toBe("existing-exact-fenced-route");
    expect(writeResult.mutationHandoff.mutationAuthority).toBe("not-granted");

    const inspectResult = await runPlanningRuntime({
      workspaceRoot,
      userTask: "Analyze context engine ranking files and related tests",
      taskKindHint: "inspect-files",
      maxRepoFiles: 80,
      maxCandidates: 5,
    });

    expect(inspectResult.context.workflowPlan.taskKind).toBe("inspect-files");
    expect(inspectResult.status).toBe("ready-for-handoff");
    expect(inspectResult.editTargets).toEqual([]);
    expect(inspectResult.mutationHandoff.readiness).toBe("blocked");
    expect(inspectResult.mutationHandoff.handoffState).toBe("planning-only");
    expect(inspectResult.mutationHandoff.backendLane).toBe("none");
    expect(inspectResult.mutationHandoff.reason).toContain("Read-only planning path");
    expect(inspectResult.mutationHandoff.mutationAuthority).toBe("not-granted");
  });
});
