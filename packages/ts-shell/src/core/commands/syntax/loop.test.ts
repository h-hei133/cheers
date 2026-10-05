import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { runLoopCommand } from "../loopCommandRuntime.js";
import { parseLoopArgs, loopArgumentCompletions } from "../loop/syntax.js";

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "loop-syntax-"));
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: { test: "echo executed > marker" } }));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

it.each(["0", "-1", "1.5", "1junk", "1e2", "11", "Infinity", "9007199254740992"])("rejects count %s before running a gate", async count => {
  for (const rawCommandArgs of [undefined, `${count} echo executed > marker`]) {
    expect(await runLoopCommand([count, "echo executed > marker"], { cwd: root, rawCommandArgs })).toMatchObject({ kind: "local", output: expect.stringContaining("Invalid /loop arguments") });
    expect(fs.existsSync(path.join(root, "marker"))).toBe(false);
  }
});

it("never substitutes npm test when only a count was supplied", async () => {
  expect(await runLoopCommand(["3"], { cwd: root })).toMatchObject({ kind: "local", output: expect.stringContaining("Invalid /loop arguments") });
  expect(fs.existsSync(path.join(root, "marker"))).toBe(false);
});

it("preserves shell grammar after a quoted count without tokenizing the gate", () => {
  const gate = "cat <<'END'\ntext with unmatched \" quote\nEND";
  expect(parseLoopArgs([], `  '2'  ${gate}`)).toEqual({ ok: true, attempts: 2, gate });
  expect(parseLoopArgs([], "echo 'a b' # comment with unmatched \" ")).toEqual({ ok: true, attempts: 5, gate: "echo 'a b' # comment with unmatched \"" });
});

it("treats suggestions as examples and describes the enforced bound honestly", async () => {
  expect(parseLoopArgs(["7", "exit 1"])).toMatchObject({ ok: true, attempts: 7 });
  expect(loopArgumentCompletions("")?.map(item => item.value)).toEqual(["3", "5", "10"]);
  const result = await runLoopCommand(["7", "exit 1"], { cwd: root });
  expect(result).toMatchObject({ kind: "prompt", notice: expect.stringContaining("runtime turn budget remains the enforced bound") });
});
