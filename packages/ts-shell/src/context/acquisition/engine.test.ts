import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runContextEngine } from "./engine.js";

let workspaceRoot: string;

beforeEach(async () => {
  workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "route207-context-engine-"));
  await fs.mkdir(path.join(workspaceRoot, "src", "runtime"), { recursive: true });
  await fs.writeFile(
    path.join(workspaceRoot, "package.json"),
    JSON.stringify({ name: "fixture", scripts: { test: "vitest run", build: "tsc -p tsconfig.json" } }, null, 2),
  );
  await fs.writeFile(
    path.join(workspaceRoot, "src", "runtime", "planner.ts"),
    [
      "import { selectTarget } from '../../orchestration/targeting.js';",
      "export function planRuntime(task: string) {",
      "  return selectTarget(task);",
      "}",
      "",
    ].join("\n"),
  );
  await fs.writeFile(
    path.join(workspaceRoot, "src", "runtime", "targeting.ts"),
    [
      "export function selectTarget(task: string) {",
      "  return task.includes('planner') ? 'planner.ts' : 'unknown';",
      "}",
      "",
    ].join("\n"),
  );
  await fs.writeFile(
    path.join(workspaceRoot, "src", "runtime", "planner.test.ts"),
    "import { planRuntime } from '../../orchestration/planner.js';\nexpect(planRuntime('planner')).toBe('planner.ts');\n",
  );
});

afterEach(async () => {
  await fs.rm(workspaceRoot, { recursive: true, force: true });
});

describe("runContextEngine", () => {
  it("turns a vague task into ranked candidates, staged reads, graph context, and compact memory", async () => {
    const result = await runContextEngine({
      workspaceRoot,
      userTask: "Fix the planner runtime target selection bug and update the related test",
      maxRepoFiles: 80,
      maxCandidates: 5,
    });

    expect(result.status).toBe("context-built");
    expect(result.repo.snapshot.packageMap[0]?.scripts).toContain("test");
    expect(result.repo.candidates.map((candidate) => candidate.safeLabel)).toContain("src/runtime/planner.ts");
    expect(result.selectedCandidate?.safeLabel).toBe("src/runtime/planner.ts");
    expect(result.discoveryHandoff).toMatchObject({
      selectedCandidateIds: [result.selectedCandidate?.candidateId],
      scanProfileId: result.repo.snapshot.scanProfile.profileId,
      targetRankingEvidenceId: result.repo.targetRanking.rankingId,
      rawContentExcluded: true,
    });
    expect(result.discoveryHandoff.ambiguityState).toBe(result.repo.targetRanking.ambiguityState);
    expect(result.discoveryHandoff.missingDiscoveryFacts).toEqual(result.repo.targetRanking.missingDiscoveryFacts);
    expect(result.discoveryHandoff.notProvenClaims).toEqual(
      expect.arrayContaining([
        "candidate-to-context-handoff-is-not-edit-authority",
        "context-found-is-not-enough-context",
      ]),
    );
    expect(result.bundle?.codeGraphTrace.traceId).toMatch(/^code_graph_trace_/);
    expect(result.bundle?.codeGraphImpact.likelyTests).toContain("src/runtime/planner.test.ts");
    expect(result.contextAcquisitionHandoff).toBe(result.bundle?.stagedContextAcquisition);
    expect(result.contextAcquisitionHandoff?.sufficiencyDecision.notProvenClaims).toEqual(
      expect.arrayContaining([
        "sufficient-for-review-only-planning-is-not-edit-authority",
        "sufficient-for-review-only-planning-is-not-task-success",
      ]),
    );
    expect(result.filesRead.map((file) => file.path)).toContain("src/runtime/planner.ts");
    expect(result.contextBudget.filesRead).toBeGreaterThan(0);
    expect(result.memory.compactSummary).toContain("target=src/runtime/planner.ts");
    expect(result.memory.fileReceipts.map((receipt) => receipt.path)).toContain("src/runtime/planner.ts");
    expect(result.evidence).toContain("context-engine:status:context-built");
    expect(result.evidence).toContain(`context-engine:discovery-handoff:${result.discoveryHandoff.handoffId}`);
    expect(result.evidence).toContain(
      `context-engine:context-acquisition-handoff:${result.contextAcquisitionHandoff?.acquisitionFactsId}`,
    );
    expect(result.evidence).toContain("context-engine:mutation-authority:not-granted");
  });

  it("reuses fresh continuation memory without rereading files on the second pass", async () => {
    const first = await runContextEngine({
      workspaceRoot,
      userTask: "Fix the planner runtime target selection bug",
      maxRepoFiles: 80,
      maxCandidates: 5,
    });

    const second = await runContextEngine({
      workspaceRoot,
      userTask: "Fix the planner runtime target selection bug",
      previousMemory: first.memory,
      maxRepoFiles: 80,
      maxCandidates: 5,
    });

    expect(second.status).toBe("reused-memory");
    expect(second.discoveryHandoff.selectedCandidateIds).toEqual([second.selectedCandidate?.candidateId]);
    expect(second.discoveryHandoff.notProvenClaims).toEqual(
      expect.arrayContaining(["selected-candidate-is-not-correct-target"]),
    );
    expect(second.contextBudget.filesRead).toBe(0);
    expect(second.memory.memoryId).toBe(first.memory.memoryId);
    expect(second.memory.missingFacts).toEqual([]);
    expect(second.missingFacts).toEqual([]);
    expect(second.memory.planningWarnings.length).toBeGreaterThan(0);
    expect(second.evidence).toContain("context-memory-reuse:avoids-reread:fresh-receipts");
  });

  it("carries no-candidate discovery handoff facts without edit authority", async () => {
    const result = await runContextEngine({
      workspaceRoot,
      userTask: "Investigate qzzxwv unexplained behavior",
      maxRepoFiles: 80,
      maxCandidates: 5,
    });

    expect(result.status).toBe("insufficient-context");
    expect(result.discoveryHandoff).toMatchObject({
      selectedCandidateIds: [],
      ambiguityState: "no-candidate",
      rawContentExcluded: true,
    });
    expect(result.discoveryHandoff.missingDiscoveryFacts).toEqual(
      expect.arrayContaining([
        "missing explicit file path",
        "missing symbol name",
        "no candidate files matched the vague task within the bounded repository scan",
      ]),
    );
    expect(result.evidence).toContain("context-engine:mutation-authority:not-granted");
  });

  it("keeps ambiguous owner selection in a disambiguation state before staged reads", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src", "payments"), { recursive: true });
    await fs.mkdir(path.join(workspaceRoot, "src", "orders"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "src", "payments", "statusPolicy.ts"),
      "export function statusPolicy() { return 'payment'; }\n",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "src", "orders", "statusPolicy.ts"),
      "export function statusPolicy() { return 'order'; }\n",
    );

    const result = await runContextEngine({
      workspaceRoot,
      userTask: "Fix statusPolicy behavior",
      maxRepoFiles: 80,
      maxCandidates: 5,
    });

    expect(result.status).toBe("ambiguous-context");
    expect(result.discoveryHandoff.ambiguityState).toBe(
      "multiple-plausible-candidates",
    );
    expect(result.discoveryHandoff.ownerNarrowingSuggestions).toEqual(
      expect.arrayContaining([
        expect.stringContaining("src/orders/statusPolicy.ts"),
        expect.stringContaining("src/payments/statusPolicy.ts"),
      ]),
    );
    expect(result.discoveryHandoff.ownerNarrowingAction).toEqual(
      expect.objectContaining({
        kind: "read-candidate-owner",
        reason: "Read the highest-ranked candidate before selecting an owner.",
      }),
    );
    expect(result.discoveryHandoff.ownerNarrowingSuggestions).toEqual(
      expect.arrayContaining([
        expect.stringContaining(result.discoveryHandoff.ownerNarrowingAction.target ?? ""),
      ]),
    );
    expect(result.bundle).toBeUndefined();
    expect(result.contextAcquisitionHandoff).toBeUndefined();
    expect(result.contextBudget.filesRead).toBe(0);
    expect(result.filesRead).toEqual([]);
    expect(result.memory.candidateFiles).toEqual(
      expect.arrayContaining([
        "src/orders/statusPolicy.ts",
        "src/payments/statusPolicy.ts",
      ]),
    );
    expect(result.nextReadSuggestions).toEqual(
      expect.arrayContaining([
        "src/orders/statusPolicy.ts",
        "src/payments/statusPolicy.ts",
      ]),
    );
    expect(result.workflowPlan.blockedReason).toContain(
      "Multiple plausible in-workspace targets",
    );
    expect(result.evidence).toContain("context-engine:status:ambiguous-context");
    expect(result.evidence).toContain("context-engine:mutation-authority:not-granted");
  });

  it("rejects previous memory when repo snapshot or workspace path boundaries do not match", async () => {
    const first = await runContextEngine({
      workspaceRoot,
      userTask: "Fix the planner runtime target selection bug",
      maxRepoFiles: 80,
      maxCandidates: 5,
    });
    const unsafeMemory = {
      ...first.memory,
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

    const unsafe = await runContextEngine({
      workspaceRoot,
      userTask: "Fix the planner runtime target selection bug",
      previousMemory: unsafeMemory,
      maxRepoFiles: 80,
      maxCandidates: 5,
    });

    expect(unsafe.status).toBe("context-built");
    expect(unsafe.evidence).toContain("context-memory-reuse:miss:unsafe-path");
    expect(unsafe.memory.selectedTargetPath).toBe("src/runtime/planner.ts");

    await fs.writeFile(
      path.join(workspaceRoot, "src", "runtime", "unreceipted.ts"),
      "export const unreceipted = true;\n",
    );
    const staleSnapshot = await runContextEngine({
      workspaceRoot,
      userTask: "Fix the planner runtime target selection bug",
      previousMemory: first.memory,
      maxRepoFiles: 80,
      maxCandidates: 5,
    });

    expect(staleSnapshot.status).toBe("context-built");
    expect(staleSnapshot.evidence).toContain("context-memory-reuse:miss:repo-snapshot-changed");
  });
});
