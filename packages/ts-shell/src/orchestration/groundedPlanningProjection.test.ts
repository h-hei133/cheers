import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runContextEngine } from "./contextEngine.js";
import { buildGroundedPlanningProjection } from "./groundedPlanningProjection.js";

let workspaceRoot: string;

beforeEach(async () => {
  workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "route208-grounded-planning-"));
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
});

afterEach(async () => {
  await fs.rm(workspaceRoot, { recursive: true, force: true });
});

describe("buildGroundedPlanningProjection", () => {
  it("builds task-specific analysis and plan text from context facts", async () => {
    const context = await runContextEngine({
      workspaceRoot,
      userTask: "Fix the planner runtime target selection bug and update the related test",
      maxRepoFiles: 80,
      maxCandidates: 5,
    });

    const projection = buildGroundedPlanningProjection(context);

    expect(projection.analysisSummary).toContain("Target src/runtime/planner.ts");
    expect(projection.analysisSummary).toContain("Read evidence:");
    expect(projection.analysisSummary).toContain("contextSufficiency=");
    expect(projection.analysisSummary).toContain("impact=");
    expect(projection.analysisSummary).toContain("Analysis confidence=");
    expect(projection.analysisSummary).not.toMatch(/^analysis-brief analysis_brief_/);
    expect(projection.planSummary).toContain("src/runtime/planner.ts");
    expect(projection.steps).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Use src/runtime/planner.ts as the primary planning target"),
        expect.stringContaining("Ground the proposal in read evidence"),
        expect.stringContaining("mutationAuthority remains not-granted"),
      ]),
    );
    expect(projection.evidence).toEqual(
      expect.arrayContaining([
        "grounded-planning:evidence-grounded",
        "grounded-planning:mutation-authority:not-granted",
        "grounded-planning:provider-call:not-run",
        "grounded-planning:command-dispatch:not-run",
        "grounded-planning:target:src/runtime/planner.ts",
      ]),
    );
  });
});
