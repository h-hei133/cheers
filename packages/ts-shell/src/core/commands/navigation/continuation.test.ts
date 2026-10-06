import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { routeSlashCommand } from "../slashRouter.js";
import { runContinuePromptCommand } from "../promptCommandRuntime.js";

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "continue-text-"));
  vi.stubEnv("HOME", root); vi.stubEnv("USERPROFILE", root);
});
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

it.each(["continue", "c"])("preserves the optional session selector and literal /%s follow-up", async name => {
  const prompt = "  don't change 'a  b' in C:\\tmp\\file\n\t--literal\\  ";
  const result = await routeSlashCommand(`/${name} \"sess_fixture_1\" ${prompt}`, { cwd: root });
  expect(result).toEqual({ kind: "shell-action", action: "continue-session", sessionId: "sess_fixture_1", continuationPrompt: prompt });
});

it("does not reinterpret ordinary prose or a later session ID as a selector", async () => {
  const prompt = "explain sess_fixture_1 and 'unfinished\\";
  expect(await routeSlashCommand("/continue " + prompt, { cwd: root })).toEqual({
    kind: "shell-action", action: "continue-session", sessionId: undefined, continuationPrompt: prompt,
  });
});

it("accepts a trailing backslash as text instead of an incomplete shell escape", async () => {
  const prompt = "inspect the directory C:\\tmp\\";
  expect(await routeSlashCommand("/continue " + prompt, { cwd: root })).toEqual({
    kind: "shell-action", action: "continue-session", sessionId: undefined, continuationPrompt: prompt,
  });
});

it("keeps bare and explicit-session continuation forms without inventing a prompt", async () => {
  expect(await runContinuePromptCommand([], { cwd: root })).toEqual({
    kind: "shell-action", action: "continue-session", sessionId: undefined, continuationPrompt: undefined,
  });
  expect(await runContinuePromptCommand(["sess_fixture"], { cwd: root })).toEqual({
    kind: "shell-action", action: "continue-session", sessionId: "sess_fixture", continuationPrompt: undefined,
  });
});
