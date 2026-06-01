import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runContextEngine } from "./engine.js";
import { buildContextPlanningBlockSummary } from "./summary.js";
import { runPlanningRuntime } from "../../planning/runtime/engine.js";

let workspaceRoot: string;

beforeEach(async () => {
  workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "context-planning-summary-"));
  await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
  await fs.writeFile(
    path.join(workspaceRoot, "package.json"),
    JSON.stringify({ name: "context-planning-fixture", scripts: { test: "vitest run" } }, null, 2),
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

describe("context planning block summary", () => {
  it("combines discovery, acquisition, planning, handoff, memory, and not-proven facts", async () => {
    const planning = await runPlanningRuntime({
      workspaceRoot,
      userTask: "Implement better context engine target ranking and cover it with a test",
      maxRepoFiles: 80,
      maxCandidates: 5,
    });
    const summary = buildContextPlanningBlockSummary({
      context: planning.context,
      planning,
      mutationHandoff: planning.mutationHandoff,
    });

    expect(summary.terminalSuccessClaim).toBe(false);
    expect(summary.status).toBe("review_only_ready");
    expect(summary.discovery.scanProfileId).toBe(planning.context.discoveryHandoff.scanProfileId);
    expect(summary.discovery.ambiguityState).toBe("unambiguous-top-candidate");
    expect(summary.acquisition.packetProvenanceCount).toBeGreaterThan(0);
    expect(summary.acquisition.contextSufficiencyStatus).toBe(
      planning.context.contextAcquisitionHandoff?.sufficiencyDecision.status,
    );
    expect(summary.planning.qualityStatus).toBe(planning.planQualityFacts.planConfidence);
    expect(summary.handoff.editNoWriteStatus).toBe("no-write-authority-granted");
    expect(summary.handoff.verificationSelectedNotRunStatus).toBe("selected-not-run");
    expect(summary.continuation.memoryReuseStatus).toBe(planning.context.memory.reuseEligibility.status);
    expect(summary.continuation.replaySafePlanningStateIds).toContain(
      planning.context.memory.planningHandoff.replaySafePlanningState.replayStateId,
    );
    expect(summary.notProvenClaims).toEqual(
      expect.arrayContaining([
        "discovery-found-is-not-correct-target",
        "context-read-is-not-repository-understanding",
        "plan-generated-is-not-executable-work",
        "edit-handoff-ready-is-not-mutation-authority",
        "verification-intent-selected-is-not-verification-passed",
        "product-surface-rendered-is-not-success",
      ]),
    );
  });

  it("keeps stale, ambiguous, unsupported, and required-refresh states visible", async () => {
    const ambiguous = await runContextEngine({
      workspaceRoot,
      userTask: "Investigate qzzxwv unexplained behavior",
      maxRepoFiles: 80,
      maxCandidates: 5,
    });
    const ambiguousSummary = buildContextPlanningBlockSummary({ context: ambiguous });

    expect(ambiguousSummary.status).toBe("blocked_ambiguous_target");
    expect(ambiguousSummary.discovery.ambiguityState).toBe("no-candidate");
    expect(ambiguousSummary.acquisition.requiredMissingFacts).toContain(
      "no selected target for context graph planning",
    );
    expect(ambiguousSummary.nextAction).toContain("resolve target ambiguity");

    const planning = await runPlanningRuntime({
      workspaceRoot,
      userTask: "Implement better context engine target ranking and cover it with a test",
      maxRepoFiles: 80,
      maxCandidates: 5,
    });
    const staleSummary = buildContextPlanningBlockSummary({
      context: {
        ...planning.context,
        memory: {
          ...planning.context.memory,
          invalidation: {
            ...planning.context.memory.invalidation,
            staleFiles: ["src/contextEngine.ts"],
            invalidationSignals: ["file-stat-mismatch:src/contextEngine.ts"],
          },
        },
      },
      planning,
    });

    expect(staleSummary.status).toBe("blocked_stale_context");
    expect(staleSummary.acquisition.staleFacts).toContain("src/contextEngine.ts");
    expect(staleSummary.nextAction).toContain("refresh");
  });

  it("does not leak raw provider, patch, command, hidden reasoning, or secret text", async () => {
    const planning = await runPlanningRuntime({
      workspaceRoot,
      userTask:
        "Implement context engine apiKey=secret oldText=before newText=after raw provider output: nope hidden reasoning stdout secret",
      maxRepoFiles: 80,
      maxCandidates: 5,
    });
    const summary = buildContextPlanningBlockSummary({
      context: planning.context,
      planning,
    });
    const serialized = JSON.stringify(summary);

    expect(serialized).not.toMatch(
      /apiKey=secret|oldText=before|newText=after|raw provider output: nope|hidden reasoning|stdout secret/i,
    );
    expect(summary.redaction.excluded).toEqual(
      expect.arrayContaining([
        "api-keys",
        "provider.env",
        "raw-provider-output",
        "oldText",
        "newText",
        "hidden-reasoning",
      ]),
    );
  });
});
