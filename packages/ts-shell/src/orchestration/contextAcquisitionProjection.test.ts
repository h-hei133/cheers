import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { projectContextAcquisition } from "../context/acquisition/projection.js";
import { runContextEngine } from "../context/acquisition/engine.js";

let workspaceRoot: string;

beforeEach(async () => {
  workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "route208-context-acquisition-"));
});

afterEach(async () => {
  await fs.rm(workspaceRoot, { recursive: true, force: true });
});

describe("projectContextAcquisition", () => {
  it("projects staged runtime reads, why-read reasons, budgets, and omissions from product context", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src", "runtime"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({ name: "fixture", scripts: { test: "vitest run" } }, null, 2),
    );
    await fs.writeFile(
      path.join(workspaceRoot, "src", "runtime", "planner.ts"),
      [
        "import { selectTarget } from './targeting.js';",
        "export function planRuntime(task: string) {",
        "  return selectTarget(task);",
        "}",
        "",
      ].join("\n"),
    );
    await fs.writeFile(
      path.join(workspaceRoot, "src", "runtime", "targeting.ts"),
      "export function selectTarget(task: string) { return task.includes('planner') ? 'planner.ts' : 'unknown'; }\n",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "src", "runtime", "planner.test.ts"),
      "import { planRuntime } from './planner.js';\nexpect(planRuntime('planner')).toBe('planner.ts');\n",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "src", "runtime", "adjacentContext.ts"),
      `export const adjacentContext = "${"x".repeat(8_200)}";\n`,
    );

    const context = await runContextEngine({
      workspaceRoot,
      userTask: "Fix the planner runtime target selection bug and update the related test",
      maxRepoFiles: 80,
      maxCandidates: 5,
    });

    const projection = projectContextAcquisition(context);

    expect(projection.mode).toBe("staged-runtime");
    expect(projection.packetId).toMatch(/^ctx_/);
    expect(projection.acquisitionId).toMatch(/^task_context_acquisition_/);
    expect(projection.budget.filesRead).toBeGreaterThan(0);
    expect(projection.budget.bytesUsed).toBeGreaterThan(0);
    expect(projection.budget.maxFilesRead).toBeGreaterThan(0);
    expect(projection.stages.map((stage) => stage.name)).toEqual(
      expect.arrayContaining([
        "candidate-discovery",
        "initial-high-value-reads",
        "sufficiency-check",
        "conditional-next-read",
        "report-and-handoff",
      ]),
    );
    expect(projection.reads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "src/runtime/planner.ts",
          source: "target-file-summary",
          whyRead: "explicit target",
        }),
      ]),
    );
    expect(projection.omitted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "src/runtime/adjacentContext.ts",
          reason: "file byte budget exceeded",
        }),
      ]),
    );
    expect(projection.enoughContext).toBe("missing-facts");
    expect(projection.nextReads).toContain("src/runtime/adjacentContext.ts");
    expect(projection.evidence).toEqual(
      expect.arrayContaining([
        "context-acquisition:mode:staged-runtime",
        "context-acquisition:stage:candidate-discovery",
        "context-acquisition:stage:initial-high-value-reads",
        "context-acquisition:budget:cache:disabled",
        "context-acquisition:enough-context:missing-facts",
        "context-acquisition:next-read:src/runtime/adjacentContext.ts",
        "context-acquisition:mutation-authority:not-granted",
        "context-acquisition:provider-call:not-run",
        "context-acquisition:command-dispatch:not-run",
        "context-acquisition:raw-content-excluded",
      ]),
    );
    expect(projection.evidence.some((entry) =>
      entry.startsWith("context-acquisition:why-read:src/runtime/planner.ts:explicit target"),
    )).toBe(true);
    expect(projection.evidence.some((entry) =>
      entry.startsWith("context-acquisition:omitted:src/runtime/adjacentContext.ts:file byte budget exceeded"),
    )).toBe(true);
  });

  it("projects insufficient context as blocked staged acquisition with missing facts", async () => {
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({ name: "empty-fixture" }, null, 2),
    );

    const context = await runContextEngine({
      workspaceRoot,
      userTask: "Explain payment reconciliation behavior",
      maxRepoFiles: 20,
      maxCandidates: 3,
    });

    const projection = projectContextAcquisition(context);

    expect(context.status).toBe("insufficient-context");
    expect(projection.mode).toBe("insufficient-context");
    expect(projection.enoughContext).toBe("missing-facts");
    expect(projection.missingFacts).toContain("no selected target for context graph planning");
    expect(projection.reads).toEqual([]);
    expect(projection.stages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "candidate-discovery",
          status: "blocked",
        }),
        expect.objectContaining({
          name: "sufficiency-check",
          status: "blocked",
        }),
      ]),
    );
    expect(projection.evidence).toEqual(
      expect.arrayContaining([
        "context-acquisition:mode:insufficient-context",
        "context-acquisition:enough-context:missing-facts",
        "context-acquisition:mutation-authority:not-granted",
      ]),
    );
  });
});
