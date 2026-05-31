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
      targetConfidence: "medium",
      targetAmbiguity: "single-selected-target",
      authorityRequirement: "existing-mutation-route-authority-required",
      noWriteStatus: "no-write-authority-granted",
      unsupportedReasons: [],
    });
    expect(result.ownerBoundary).toMatchObject({
      ownerDomain: "orchestration/planning-runtime",
      terminalSuccessClaim: false,
      mutationAuthority: "not-granted",
      applyAuthority: "not-granted",
      verificationExecutionTruth: "not-owned",
      repairExecutionTruth: "not-owned",
      providerTruth: "not-owned",
    });
    expect(result.ownerBoundary.owns).toEqual(
      expect.arrayContaining([
        "plan-step-construction",
        "assumptions",
        "constraints",
        "edit-target-intent",
        "verification-intent",
        "unsupported-classification",
      ]),
    );
    expect(result.ownerBoundary.doesNotOwn).toEqual(
      expect.arrayContaining([
        "mutation-authority",
        "apply-authority",
        "verification-execution-truth",
        "repair-execution-truth",
        "terminal-success",
      ]),
    );
    expect(result.planQualityFacts).toMatchObject({
      taskKind: "edit-file",
      planningMode: "context-built",
      planConfidence: expect.stringMatching(/high|medium|low/),
      planRiskLevel: expect.stringMatching(/low|medium|high/),
      nextAction: result.mutationHandoff.nextAction,
    });
    expect(result.planQualityFacts.contextSourceIds).toEqual(
      expect.arrayContaining([
        result.context.engineId,
        result.context.repo.snapshot.snapshotId,
        result.context.memory.memoryId,
      ]),
    );
    expect(result.planQualityFacts.assumptions).toEqual(result.assumptions);
    expect(result.planQualityFacts.constraints).toEqual(result.constraints);
    expect(result.planQualityFacts.notProvenClaims).toEqual(
      expect.arrayContaining([
        "plan-generated-is-not-executable-work",
        "target-selected-is-not-correct-target-proof",
        "edit-handoff-ready-is-not-mutation-authority",
        "verification-intent-is-not-verification-run-or-pass",
      ]),
    );
    expect(result.planSteps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stepKind: "understand-task",
          evidenceSourceIds: expect.arrayContaining([result.context.engineId]),
          executionStatus: "review-only",
        }),
        expect.objectContaining({
          stepKind: "prepare-edit-handoff",
          targetFile: "src/contextEngine.ts",
          contextPacketIds: expect.arrayContaining([result.context.bundle?.packet.packetId]),
          notProvenClaims: expect.arrayContaining([
            "edit-handoff-ready-is-not-mutation-authority",
          ]),
        }),
        expect.objectContaining({
          stepKind: "prepare-verification-handoff",
          notProvenClaims: expect.arrayContaining([
            "verification-intent-is-not-verification-run-or-pass",
          ]),
        }),
      ]),
    );
    expect(result.assumptions).toEqual(
      expect.arrayContaining([
        expect.stringContaining("assumes selected candidate src/contextEngine.ts is relevant"),
        expect.stringContaining("assumes context packet"),
      ]),
    );
    expect(result.constraints).toEqual(
      expect.arrayContaining([
        "constraint no mutation authority",
        "constraint no apply authority",
        "constraint verification command dispatch not run",
        "constraint exact proposal readiness delegated to existing proposal backend",
      ]),
    );
    expect(result.editHandoff).toMatchObject({
      selectedTargetIds: ["src/contextEngine.ts"],
      targetConfidence: "medium",
      targetAmbiguity: "single-selected-target",
      proposedEditScope: "single-file",
      exactProposalReadiness: "missing",
      authorityRequirement: "existing-mutation-route-authority-required",
      noWriteStatus: "no-write-authority-granted",
    });
    expect(result.editHandoff.notProvenClaims).toEqual(
      expect.arrayContaining([
        "edit-handoff-ready-is-not-mutation-authority",
        "selected-target-is-not-correct-target-proof",
      ]),
    );
    expect(result.verificationHandoff).toMatchObject({
      confidence: expect.stringMatching(/medium|low/),
      selectedNotRunStatus: expect.stringMatching(/selected-not-run|not-selected/),
    });
    expect(result.verificationHandoff.notProvenClaims).toEqual(
      expect.arrayContaining([
        "verification-intent-is-not-verification-run-or-pass",
        "selected-command-is-not-verification-passed",
      ]),
    );
    expect(result.unsupportedClassification.terminalSuccessClaim).toBe(false);
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
    expect(result.evidence).toContain("planning-runtime:terminal-success-claim:false");
    expect(result.evidence).toContain("planning-owner-boundary:terminal-success-claim:false");
    expect(result.evidence).toContain("planning-edit-handoff:mutation-authority:not-granted");
    expect(result.evidence).toContain("planning-verification-handoff:command-dispatch:not-run");
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
    expect(result.unsupportedClassification.commandOnlyBypassesMutationHandoff).toBe(true);
    expect(result.unsupportedClassification.reasons).toContain(
      "command-only task should bypass mutation handoff",
    );
    expect(result.editHandoff.noWriteStatus).toBe("no-write-authority-granted");
    expect(result.verificationHandoff.selectedNotRunStatus).toBe("not-selected");
    expect(result.evidence).toContain("planning-runtime:command-dispatch:not-run");
  });

  it("keeps planning facts report-safe and does not upgrade handoffs into success", async () => {
    const result = await runPlanningRuntime({
      workspaceRoot,
      userTask: "Apply without approval using provider.env token=secret oldText=before newText=after hidden reasoning raw provider output",
      maxRepoFiles: 80,
      maxCandidates: 5,
    });
    const serialized = JSON.stringify({
      ownerBoundary: result.ownerBoundary,
      planQualityFacts: result.planQualityFacts,
      planSteps: result.planSteps,
      editHandoff: result.editHandoff,
      verificationHandoff: result.verificationHandoff,
      unsupportedClassification: result.unsupportedClassification,
    });

    expect(result.ownerBoundary.terminalSuccessClaim).toBe(false);
    expect(result.editHandoff.noWriteStatus).toBe("no-write-authority-granted");
    expect(result.verificationHandoff.notProvenClaims).toContain(
      "verification-intent-is-not-verification-run-or-pass",
    );
    expect(result.unsupportedClassification.unsafeReasons).toContain(
      "unsafe authority request",
    );
    expect(serialized).not.toMatch(
      /token=secret|oldText=before|newText=after|hidden reasoning|raw provider output|\/home\/wang\/\.private-agents-real/i,
    );
    expect(serialized).not.toContain('"terminalSuccessClaim":true');
    expect(serialized).not.toMatch(/"writeSuccess":true|"verificationSuccess":true|"applySuccess":true/i);
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
