import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { routeSlashCommand } from "./slashRouter.js";

let root: string;
const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "commit-text-"));
  vi.stubEnv("HOME", root); vi.stubEnv("USERPROFILE", root);
  git("init", "--quiet");
  fs.writeFileSync(path.join(root, "new.txt"), "staged evidence\n");
  git("add", "new.txt");
});
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

it("preserves commit guidance without staging or committing during prompt construction", async () => {
  const guidance = "  retain 'a  b' and C:\\tmp\\file\n\t--literal\\  ";
  const before = git("ls-files", "--stage");
  const result = await routeSlashCommand("/commit " + guidance, { cwd: root });
  expect(result).toMatchObject({ kind: "prompt", prompt: expect.stringContaining("What the user said about it: " + guidance + "\n") });
  expect(git("ls-files", "--stage")).toBe(before);
  expect(git("rev-list", "--all")).toBe("");
  expect(fs.readFileSync(path.join(root, "new.txt"), "utf8")).toBe("staged evidence\n");
});
