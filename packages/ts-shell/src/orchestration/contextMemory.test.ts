import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runContextEngine } from "./contextEngine.js";
import {
  canReuseContextMemory,
  evaluateContextMemoryFreshness,
} from "./contextMemory.js";

let workspaceRoot: string;

beforeEach(async () => {
  workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "context-memory-"));
  await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
  await fs.writeFile(
    path.join(workspaceRoot, "package.json"),
    JSON.stringify({ name: "context-memory-fixture", scripts: { test: "vitest run" } }, null, 2),
  );
  await fs.writeFile(
    path.join(workspaceRoot, "src", "planner.ts"),
    [
      "export function choosePlannerTarget(task: string) {",
      "  return task.includes('planner') ? 'planner.ts' : 'unknown';",
      "}",
      "",
    ].join("\n"),
  );
  await fs.writeFile(
    path.join(workspaceRoot, "src", "planner.test.ts"),
    "import { choosePlannerTarget } from './planner.js';\nexpect(choosePlannerTarget('planner')).toBe('planner.ts');\n",
  );
});

afterEach(async () => {
  await fs.rm(workspaceRoot, { recursive: true, force: true });
});

describe("context memory facts", () => {
  it("records report-safe source ids, invalidation, handoff, and not-proven facts", async () => {
    const result = await runContextEngine({
      workspaceRoot,
      userTask: "Fix planner target selection in src/planner.ts",
      maxRepoFiles: 30,
      maxCandidates: 4,
    });

    const memory = result.memory;
    const serializedRecord = JSON.stringify({
      recordFacts: memory.recordFacts,
      discoveryHandoff: memory.discoveryHandoff,
      planningHandoff: memory.planningHandoff,
    });

    expect(memory.recordFacts).toMatchObject({
      memoryId: memory.memoryId,
      sourceTurnOrLabel: "context-engine-current-turn",
      createdPhase: "context-memory",
      intendedReuseScope: "same-task-same-workspace-review-only-planning",
      redactionState: "report-safe",
    });
    expect(memory.recordFacts.sourceCandidateIds.length).toBeGreaterThan(0);
    expect(memory.recordFacts.sourceContextPacketIds.length).toBeGreaterThan(0);
    expect(memory.recordFacts.sourcePlanningIds.length).toBeGreaterThan(0);
    expect(memory.recordFacts.notProvenClaims).toContain(
      "memory-record-exists-is-not-fresh-context",
    );
    expect(memory.reuseEligibility.notProvenClaims).toContain(
      "memory-reused-is-not-enough-context",
    );
    expect(memory.discoveryHandoff.notProvenClaims).toContain(
      "required-refresh-cannot-be-bypassed-by-memory",
    );
    expect(memory.planningHandoff.notProvenClaims).toContain(
      "replayed-edit-handoff-is-not-mutation-authority",
    );
    expect(memory.planningHandoff.replaySafePlanningState.notProvenClaims).toContain(
      "replay-state-available-is-not-plan-validity",
    );
    expect(serializedRecord).not.toMatch(
      /apiKey=|api_key=|provider\.env=|raw provider output:|oldText=|newText=|hidden reasoning:/i,
    );
  });

  it("classifies reuse eligibility and emits refresh handoffs for stale, mismatch, and unsupported memory", async () => {
    const first = await runContextEngine({
      workspaceRoot,
      userTask: "Fix planner target selection in src/planner.ts",
      maxRepoFiles: 30,
      maxCandidates: 4,
    });

    await fs.writeFile(
      path.join(workspaceRoot, "src", "planner.ts"),
      "export const changed = true;\n",
    );
    const stale = await canReuseContextMemory({
      workspaceRoot,
      userTask: "Fix planner target selection in src/planner.ts",
      currentRepoSnapshotId: first.memory.repoSnapshotId,
      currentRepoFileLabels: first.repo.snapshot.files.map((file) => file.safeLabel),
      memory: first.memory,
    });

    expect(stale.reusable).toBe(false);
    expect(stale.eligibility.status).toBe("stale");
    expect(stale.discoveryHandoff?.stagedReadsToRerun).toContain(
      "stale-or-missing-context-packets",
    );
    expect(stale.planningHandoff?.replaySafePlanningState.continuationReadiness).toBe(
      "requires-refresh",
    );
    expect(stale.evidence).toContain("context-memory-reuse:miss:stale-files");

    const taskMismatch = await canReuseContextMemory({
      workspaceRoot,
      userTask: "Explain a different module",
      currentRepoSnapshotId: first.memory.repoSnapshotId,
      currentRepoFileLabels: first.repo.snapshot.files.map((file) => file.safeLabel),
      memory: first.memory,
    });
    expect(taskMismatch.reusable).toBe(false);
    expect(taskMismatch.eligibility.status).toBe("task_mismatch");
    expect(taskMismatch.discoveryHandoff?.discoveryFactsToRerun).toEqual(
      expect.arrayContaining(["target-ranking", "candidate-freshness"]),
    );

    const unsupported = await canReuseContextMemory({
      workspaceRoot,
      userTask: "Fix planner target selection in src/planner.ts",
    });
    expect(unsupported.reusable).toBe(false);
    expect(unsupported.eligibility.status).toBe("unsupported");
    expect(unsupported.eligibility.requiredRefreshSuggestions).toContain(
      "run bounded discovery and staged reads",
    );
  });

  it("marks missing freshness evidence instead of guessing fresh context", async () => {
    const freshness = await evaluateContextMemoryFreshness({
      workspaceRoot,
      memory: { fileReceipts: [] },
    });

    expect(freshness.invalidated).toBe(true);
    expect(freshness.missingFreshnessEvidence).toContain("no file receipts available");
    expect(freshness.nextReadSuggestions).toContain(
      "rebuild context memory: no file receipts available",
    );
    expect(freshness.notProvenClaims).toEqual(
      expect.arrayContaining([
        "memory-exists-is-not-fresh-context",
        "refresh-suggested-is-not-completed-read",
      ]),
    );
  });
});
