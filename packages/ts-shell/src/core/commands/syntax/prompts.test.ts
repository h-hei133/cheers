import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { runGoalCommand, getActiveSessionGoal } from "../goalCommandRuntime.js";
import { runBrainstormCommand } from "../brainstormCommandRuntime.js";
import { createCommandRegistry } from "../registry.js";
import * as state from "../../state/projectState.js";

let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "prompt-syntax-")); vi.stubEnv("HOME", root); vi.stubEnv("USERPROFILE", root); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

it("keeps reserved words inside a multiword goal as prose and supports done", async () => {
  await runGoalCommand(["pause", "the", "migration", "--safely"], { cwd: root });
  expect(getActiveSessionGoal(root)).toMatchObject({ objective: "pause the migration --safely", phase: "active" });
  await runGoalCommand(["done"], { cwd: root });
  expect(getActiveSessionGoal(root)?.phase).toBe("complete");
  await runGoalCommand(["resume"], { cwd: root });
  expect(getActiveSessionGoal(root)?.phase).toBe("active");
});

it("does not claim persisted or in-memory success when goal writes fail", async () => {
  await runGoalCommand(["existing"], { cwd: root });
  vi.spyOn(state, "writeProjectState").mockReturnValue(undefined);
  for (const args of [["replacement"], ["clear"], ["pause"], ["done"]]) {
    const result = await runGoalCommand(args, { cwd: root });
    expect(result.output).toContain("not confirmed persisted");
    expect(result.output).not.toMatch(/Objective set|Objective cleared|lost when this process ends/);
    expect(getActiveSessionGoal(root)).toMatchObject({ objective: "existing", phase: "active" });
  }
});

it.each([["--unknown", "design"], ["-i", "-s", "design"], ["--save=false", "design"], ["-i", "--interactive", "design"]])("rejects invalid brainstorm flags %j", async (...args) => {
  expect(await runBrainstormCommand(args, { cwd: root })).toMatchObject({ kind: "local", output: expect.stringContaining("Invalid /brainstorm arguments") });
});

it("keeps literal flag-shaped prose after -- and accepts real short aliases", async () => {
  const literal = await runBrainstormCommand(["--", "--save", "design"], { cwd: root });
  expect(literal).toMatchObject({ kind: "prompt", prompt: expect.stringContaining("--save design"), notice: "Exploring 3 approaches." });
  expect(await runBrainstormCommand(["-i", "design"], { cwd: root })).toMatchObject({ kind: "prompt", prompt: expect.stringContaining("Do not propose a solution") });
  expect(await runBrainstormCommand(["-s", "design"], { cwd: root })).toMatchObject({ kind: "prompt", prompt: expect.stringContaining("only after the write tool has reported success") });
});

it("derives short flags, conflicts and goal aliases from syntax", () => {
  const registry = createCommandRegistry(root);
  const suggest = (name: string, prefix: string) => registry.get(name)!.getArgumentCompletions?.(prefix)?.map(item => item.value) ?? [];
  expect(suggest("brainstorm", "-i")).toEqual(["-i"]);
  expect(suggest("brainstorm", "-i -s")).toEqual([]);
  expect(suggest("brainstorm", "-- ")).toEqual([]);
  expect(suggest("goal", "do")).toEqual(["done"]);
  expect(suggest("goal", "pause the ")).toEqual([]);
});
