import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { runPlanningRuntime } from "../../../packages/ts-shell/src/orchestration/planningRuntime.js";
import type { ContextWorkingMemory } from "../../../packages/ts-shell/src/orchestration/contextMemory.js";
import { projectPlanningRuntimeSurface } from "../../../packages/ts-shell/src/orchestration/planningRuntimeSurface.js";

interface DemoCase {
  readonly label: string;
  readonly task: string;
  readonly previousMemory?: ContextWorkingMemory;
}

const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "route207-demo-"));
try {
  await seedWorkspace(workspaceRoot);
  const cases: DemoCase[] = [
    {
      label: "vague-bugfix",
      task: "Fix the planner target ranking bug and cover the adjacent test",
    },
    {
      label: "vague-feature",
      task: "Add context memory reuse to the planning runtime",
    },
    {
      label: "test-related",
      task: "Find the test for planning runtime verification intent",
    },
    {
      label: "multi-file-impact",
      task: "Update context engine imports and related planning runtime tests",
    },
    {
      label: "insufficient-context",
      task: "Tune the billing webhook retry policy",
    },
  ];

  let reusableMemory: ContextWorkingMemory | undefined;
  const reports = [];
  for (const demoCase of cases) {
    const result = await runPlanningRuntime({
      workspaceRoot,
      userTask: demoCase.task,
      previousMemory: demoCase.previousMemory,
      maxRepoFiles: 80,
      maxCandidates: 5,
    });
    if (demoCase.label === "vague-bugfix") {
      reusableMemory = result.continuationMemory;
    }
    reports.push(projectReport(demoCase.label, result));
  }
  if (reusableMemory) {
    const secondPass = await runPlanningRuntime({
      workspaceRoot,
      userTask: "Fix the planner target ranking bug and cover the adjacent test",
      previousMemory: reusableMemory,
      maxRepoFiles: 80,
      maxCandidates: 5,
    });
    reports.push(projectReport("memory-reuse-second-pass", secondPass));
  }

  console.log(JSON.stringify({
    route: "207",
    workspace: path.basename(workspaceRoot),
    cases: reports,
  }, null, 2));
} finally {
  await fs.rm(workspaceRoot, { recursive: true, force: true });
}

function projectReport(label: string, result: Awaited<ReturnType<typeof runPlanningRuntime>>) {
  const surface = projectPlanningRuntimeSurface(result);
  return {
    label,
    status: surface.status,
    contextStatus: surface.contextStatus,
    candidates: surface.candidates,
    filesRead: surface.filesRead.map((file) => file.path),
    enoughContext: surface.enoughContext,
    missingFacts: surface.missingFacts,
    planningWarnings: surface.planningWarnings,
    analysis: surface.groundedAnalysis.summary,
    plan: surface.executablePlan.steps,
    editTargets: surface.editTargets,
    verificationIntent: surface.verificationIntent.state,
    handoff: surface.mutationHandoff,
    memory: surface.memory,
    safety: surface.safety,
  };
}

async function seedWorkspace(root: string): Promise<void> {
  await fs.mkdir(path.join(root, "src", "planning"), { recursive: true });
  await fs.writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ name: "route207-demo", scripts: { test: "vitest run", build: "tsc -p tsconfig.json" } }, null, 2),
  );
  await fs.writeFile(
    path.join(root, "src", "planning", "contextEngine.ts"),
    [
      "import { rememberContext } from './contextMemory.js';",
      "export function rankContextTarget(task: string) {",
      "  return task.includes('planner') ? 'plannerRuntime.ts' : rememberContext(task);",
      "}",
      "",
    ].join("\n"),
  );
  await fs.writeFile(
    path.join(root, "src", "planning", "contextMemory.ts"),
    "export function rememberContext(task: string) { return task.includes('memory') ? 'contextMemory.ts' : 'unknown'; }\n",
  );
  await fs.writeFile(
    path.join(root, "src", "planning", "plannerRuntime.ts"),
    [
      "import { rankContextTarget } from './contextEngine.js';",
      "export function planRuntime(task: string) {",
      "  return rankContextTarget(task);",
      "}",
      "",
    ].join("\n"),
  );
  await fs.writeFile(
    path.join(root, "src", "planning", "plannerRuntime.test.ts"),
    [
      "import { planRuntime } from './plannerRuntime.js';",
      "expect(planRuntime('planner target')).toBe('plannerRuntime.ts');",
      "",
    ].join("\n"),
  );
  await fs.writeFile(
    path.join(root, "README.md"),
    "Route207 fixture for context engine and planning runtime demos.\n",
  );
}
