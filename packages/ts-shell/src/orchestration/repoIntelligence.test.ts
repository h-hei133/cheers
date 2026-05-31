import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildRepoIntelligence } from "../context/discovery/scan.js";

let workspaceRoot: string;

beforeEach(async () => {
  workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "repo-intelligence-"));
});

afterEach(async () => {
  await fs.rm(workspaceRoot, { recursive: true, force: true });
});

describe("buildRepoIntelligence", () => {
  it("exposes report-safe scan profile and omission accounting for bounded discovery", async () => {
    await fs.mkdir(path.join(workspaceRoot, ".codex", "prompts"), { recursive: true });
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(path.join(workspaceRoot, ".codex", "prompts", "private.md"), "ignored prompt\n");
    await fs.writeFile(path.join(workspaceRoot, "notes.txt"), "unsupported target ranking note\n");
    await fs.writeFile(path.join(workspaceRoot, "src", "targetRanking.ts"), "export function targetRanking() { return true; }\n");

    const result = await buildRepoIntelligence({
      workspaceRoot,
      userTask: "Fix targetRanking",
      maxFiles: 20,
      maxCandidates: 5,
    });

    expect(result.snapshot.scanProfile).toMatchObject({
      scanMode: "bounded-local-files",
      rawContentExcluded: true,
      scanLimitReached: false,
    });
    expect(result.snapshot.scanProfile.scanBudget.maxFiles).toBe(20);
    expect(result.snapshot.scanProfile.filesConsideredCount).toBeGreaterThan(0);
    expect(result.snapshot.scanProfile.filesOmittedCount).toBeGreaterThan(0);
    expect(result.snapshot.scanProfile.omittedReasonCategories).toEqual(
      expect.arrayContaining(["generated-or-vendor-path-excluded", "file-type-excluded"]),
    );
    expect(result.snapshot.scanProfile.notProvenClaims).toEqual(
      expect.arrayContaining(["scan-completed-is-not-repository-understanding"]),
    );
    expect(result.snapshot.candidateOmissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: "generated-or-vendor-path-excluded",
          notProvenClaims: expect.arrayContaining(["omitted-file-is-not-irrelevant"]),
        }),
      ]),
    );
  });

  it("reports safe candidate evidence, score components, ranking reasons, and truthfulness limits", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "src", "targetRanking.ts"),
      "export function rankTargetCandidate() { return 'target'; }\n",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "src", "targetRanking.test.ts"),
      "import { rankTargetCandidate } from './targetRanking.js';\n",
    );

    const result = await buildRepoIntelligence({
      workspaceRoot,
      userTask: "Fix rankTargetCandidate in src/targetRanking.ts and update targetRanking test",
      maxFiles: 20,
      maxCandidates: 5,
    });
    const candidate = result.candidates[0];

    expect(candidate).toMatchObject({
      safeLabel: "src/targetRanking.ts",
      role: "source",
      moduleHint: "src",
      freshness: "fresh-stat",
    });
    expect(candidate?.candidateId).toMatch(/^repo_candidate_/);
    expect(candidate?.scoreComponents.taskTokenOverlap).toBeGreaterThan(0);
    expect(candidate?.pathMatchReasons.length).toBeGreaterThan(0);
    expect(candidate?.taskTokenMatchReasons).toEqual(expect.arrayContaining(["task-token:target"]));
    expect(candidate?.testAdjacencyHints).toEqual(expect.arrayContaining(["related-test:src/targetRanking.test.ts"]));
    expect(candidate?.notProvenClaims).toEqual(
      expect.arrayContaining([
        "high-rank-is-not-correct-target",
        "selected-candidate-is-not-edit-authority",
      ]),
    );
    expect(result.targetRanking.notProvenClaims).toEqual(
      expect.arrayContaining(["target-ranking-is-not-task-success"]),
    );
  });

  it("keeps target ranking ambiguity visible without granting target correctness", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(path.join(workspaceRoot, "src", "alphaTarget.ts"), "export function selectTarget() { return 'a'; }\n");
    await fs.writeFile(path.join(workspaceRoot, "src", "betaTarget.ts"), "export function selectTarget() { return 'b'; }\n");

    const result = await buildRepoIntelligence({
      workspaceRoot,
      userTask: "Fix selectTarget target behavior",
      maxFiles: 20,
      maxCandidates: 5,
    });

    expect(result.targetRanking.ambiguityState).toBe("multiple-plausible-candidates");
    expect(result.targetRanking.competingCandidateIds.length).toBeGreaterThan(0);
    expect(result.targetRanking.missingDiscoveryFacts).toEqual(
      expect.arrayContaining(["ambiguous candidate set", "target family uncertainty"]),
    );
    expect(result.targetRanking.notProvenClaims).toEqual(
      expect.arrayContaining(["high-ranked-file-is-not-correct-target"]),
    );
  });

  it("emits missing discovery facts for no-candidate and weak pathless tasks", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(path.join(workspaceRoot, "src", "planner.ts"), "export const planner = true;\n");

    const none = await buildRepoIntelligence({
      workspaceRoot,
      userTask: "Investigate qzzxwv unexplained behavior",
      maxFiles: 20,
      maxCandidates: 5,
    });

    expect(none.candidates).toHaveLength(0);
    expect(none.targetRanking.ambiguityState).toBe("no-candidate");
    expect(none.targetRanking.missingDiscoveryFacts).toEqual(
      expect.arrayContaining([
        "missing explicit file path",
        "missing symbol name",
        "no candidate files matched the vague task within the bounded repository scan",
      ]),
    );
    expect(none.missingFacts).toContain("no candidate files matched the vague task within the bounded repository scan");

    const weak = await buildRepoIntelligence({
      workspaceRoot,
      userTask: "plan",
      maxFiles: 20,
      maxCandidates: 5,
    });

    expect(weak.candidates[0]?.safeLabel).toBe("src/planner.ts");
    expect(weak.targetRanking.ambiguityState).toBe("weak-signal-candidate");
    expect(weak.targetRanking.weakCandidateIds).toEqual([weak.candidates[0]?.candidateId]);
    expect(weak.targetRanking.missingDiscoveryFacts).toEqual(
      expect.arrayContaining(["weak target ranking signal", "missing explicit file path"]),
    );
    expect(weak.missingFacts).toContain("weak target ranking signal");
  });

  it("does not leak unsafe prompt or raw content markers into discovery facts", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(path.join(workspaceRoot, "src", "providerTarget.ts"), "export const providerTarget = true;\n");

    const result = await buildRepoIntelligence({
      workspaceRoot,
      userTask: "Fix providerTarget token=secret api_key=abc oldText=before newText=after raw provider output: nope hidden reasoning",
      maxFiles: 20,
      maxCandidates: 5,
    });
    const serialized = JSON.stringify(result);

    expect(serialized).not.toMatch(/token=secret|api_key=abc|oldText=before|newText=after|raw provider output: nope|hidden reasoning/i);
    expect(serialized).toContain("raw-content-excluded");
    expect(result.snapshot.scanProfile.rawContentExcluded).toBe(true);
  });

  it("excludes local agent and audit directories from product-path candidates", async () => {
    await fs.mkdir(path.join(workspaceRoot, ".codex", "prompts"), { recursive: true });
    await fs.mkdir(path.join(workspaceRoot, ".omx", "context"), { recursive: true });
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, ".codex", "prompts", "test-engineer.md"),
      "target ranking bug test prompt\n",
    );
    await fs.writeFile(
      path.join(workspaceRoot, ".omx", "context", "target-ranking.md"),
      "target ranking bug context\n",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "src", "targetRanking.ts"),
      "export function rankTarget() { return 'targetRanking'; }\n",
    );

    const result = await buildRepoIntelligence({
      workspaceRoot,
      userTask: "Fix target ranking bug",
      maxFiles: 80,
      maxCandidates: 5,
    });

    expect(result.snapshot.files.map((file) => file.safeLabel)).toContain("src/targetRanking.ts");
    expect(result.snapshot.files.some((file) => file.safeLabel.startsWith(".codex/"))).toBe(false);
    expect(result.snapshot.files.some((file) => file.safeLabel.startsWith(".omx/"))).toBe(false);
    expect(result.candidates.map((candidate) => candidate.safeLabel)).toEqual(
      expect.arrayContaining(["src/targetRanking.ts"]),
    );
    expect(result.candidates.some((candidate) => candidate.safeLabel.startsWith(".codex/"))).toBe(false);
    expect(result.candidates.some((candidate) => candidate.safeLabel.startsWith(".omx/"))).toBe(false);
  });

  it("keeps code candidates ahead of route docs when a bounded scan would otherwise exhaust on docs", async () => {
    await fs.mkdir(path.join(workspaceRoot, "docs", "agent-routes"), { recursive: true });
    await fs.mkdir(path.join(workspaceRoot, "packages", "ts-shell", "src", "orchestration"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({ name: "fixture" }, null, 2),
    );
    await fs.writeFile(
      path.join(workspaceRoot, "packages", "ts-shell", "package.json"),
      JSON.stringify({ name: "@fixture/ts-shell", scripts: { test: "vitest run" } }, null, 2),
    );
    for (let index = 0; index < 80; index += 1) {
      await fs.writeFile(
        path.join(workspaceRoot, "docs", "agent-routes", `route${index}-context-engine-target-ranking.md`),
        "context engine target ranking route note\n",
      );
    }
    await fs.writeFile(
      path.join(workspaceRoot, "packages", "ts-shell", "src", "orchestration", "contextEngine.ts"),
      [
        "export function buildContextEngineTargetRanking(task: string) {",
        "  return task.includes('contextEngine') ? 'contextEngine.ts' : 'unknown';",
        "}",
        "",
      ].join("\n"),
    );
    await fs.writeFile(
      path.join(workspaceRoot, "packages", "ts-shell", "src", "orchestration", "contextEngine.test.ts"),
      "import { buildContextEngineTargetRanking } from './contextEngine.js';\nexpect(buildContextEngineTargetRanking('contextEngine')).toBe('contextEngine.ts');\n",
    );

    const result = await buildRepoIntelligence({
      workspaceRoot,
      userTask: "Fix contextEngine target ranking bug in packages ts shell orchestration and cover contextEngine test",
      maxFiles: 40,
      maxCandidates: 5,
    });

    expect(result.snapshot.files.map((file) => file.safeLabel)).toContain(
      "packages/ts-shell/src/orchestration/contextEngine.ts",
    );
    expect(result.candidates[0]).toMatchObject({
      safeLabel: "packages/ts-shell/src/orchestration/contextEngine.ts",
      role: "source",
    });
    expect(result.candidates[1]).toMatchObject({
      safeLabel: "packages/ts-shell/src/orchestration/contextEngine.test.ts",
      role: "test",
    });
    expect(result.candidates.slice(0, 2).some((candidate) => candidate.role === "docs")).toBe(false);
  });

  it("prefills deep path-matched product files before earlier source directories exhaust the scan budget", async () => {
    await fs.mkdir(path.join(workspaceRoot, "packages", "ts-shell", "src", "core"), { recursive: true });
    await fs.mkdir(path.join(workspaceRoot, "packages", "ts-shell", "src", "orchestration"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({ name: "fixture" }, null, 2),
    );
    for (let index = 0; index < 80; index += 1) {
      await fs.writeFile(
        path.join(workspaceRoot, "packages", "ts-shell", "src", "core", `runtimeReceipt${index}.ts`),
        `export const runtimeReceipt${index} = ${index};\n`,
      );
    }
    await fs.writeFile(
      path.join(workspaceRoot, "packages", "ts-shell", "src", "orchestration", "planningRuntimeProductProjection.ts"),
      "export function formatPlanningRuntimeProductOutput() { return 'product output'; }\n",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "packages", "ts-shell", "src", "orchestration", "planningRuntimeProductProjection.test.ts"),
      "import { formatPlanningRuntimeProductOutput } from './planningRuntimeProductProjection.js';\nexpect(formatPlanningRuntimeProductOutput()).toBe('product output');\n",
    );

    const result = await buildRepoIntelligence({
      workspaceRoot,
      userTask: "Fix planning runtime product output so confirmed apply results do not still look review-only",
      maxFiles: 30,
      maxCandidates: 5,
    });

    expect(result.snapshot.files.map((file) => file.safeLabel)).toContain(
      "packages/ts-shell/src/orchestration/planningRuntimeProductProjection.ts",
    );
    expect(result.candidates[0]).toMatchObject({
      safeLabel: "packages/ts-shell/src/orchestration/planningRuntimeProductProjection.ts",
      role: "source",
    });
  });

  it("keeps docs first for docs-only route explanation prompts", async () => {
    await fs.mkdir(path.join(workspaceRoot, "docs", "agent-routes"), { recursive: true });
    await fs.mkdir(path.join(workspaceRoot, "packages", "ts-shell", "src", "orchestration"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "docs", "agent-routes", "route208-product-path-agentic-rap-edit-loop.md"),
      "route208 product path agentic read analyze plan edit loop\n",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "packages", "ts-shell", "src", "orchestration", "route208ProductPath.ts"),
      "export const route208ProductPath = true;\n",
    );

    const result = await buildRepoIntelligence({
      workspaceRoot,
      userTask: "Explain route208 product path doc",
      maxFiles: 20,
      maxCandidates: 5,
    });

    expect(result.candidates[0]).toMatchObject({
      safeLabel: "docs/agent-routes/route208-product-path-agentic-rap-edit-loop.md",
      role: "docs",
    });
  });
});
