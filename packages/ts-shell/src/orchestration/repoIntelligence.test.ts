import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildRepoIntelligence } from "./repoIntelligence.js";

let workspaceRoot: string;

beforeEach(async () => {
  workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "repo-intelligence-"));
});

afterEach(async () => {
  await fs.rm(workspaceRoot, { recursive: true, force: true });
});

describe("buildRepoIntelligence", () => {
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
