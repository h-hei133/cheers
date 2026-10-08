import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { parseGoalArgs } from '../goal/syntax.js';
import { runBrainstormCommand } from "../brainstormCommandRuntime.js";
import { createCommandRegistry } from "../registry.js";

let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "prompt-syntax-")); vi.stubEnv("HOME", root); vi.stubEnv("USERPROFILE", root); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

it("keeps reserved words inside a multiword goal as prose and supports canonical verbs and aliases", () => {
  expect(parseGoalArgs(['pause', 'the', 'migration', '--safely'])).toMatchObject({ ok: true, action: { name: '' }, args: ['pause', 'the', 'migration', '--safely'] });
  expect(parseGoalArgs(['done'])).toMatchObject({ ok: true, action: { name: 'complete' } });
  expect(parseGoalArgs(['clear'])).toMatchObject({ ok: true, action: { name: 'drop' } });
  expect(parseGoalArgs(['set', 'pause', 'the', 'migration'])).toMatchObject({ ok: true, action: { name: 'set' }, args: ['pause', 'the', 'migration'] });
});

it.each([['set'], ['show', 'extra'], ['drop', 'extra'], ['import', 'extra'], ['budget']])("rejects malformed canonical goal arguments %j", (...args) => {
  expect(parseGoalArgs(args).ok).toBe(false);
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
