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
      maxRepoFiles: 80,
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
});
