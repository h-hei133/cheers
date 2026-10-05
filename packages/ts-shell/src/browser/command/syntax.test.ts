import { afterEach, expect, it, vi } from "vitest";
import { parseBrowserCommandArgs } from "../commandContract.js";
import { parseBrowserReplayCommandArgs } from "../replayCommandContract.js";
import { parseBrowserSelfHealingCommandArgs } from "../selfHealingCommandContract.js";
import { browserCompletions } from "./completion.js";
import { runBrowserLocalCommand } from "../../core/commands/browserCommandRuntime.js";
import * as runner from "../commandRunner.js";
import * as smoke from "../smoke/runner.js";

afterEach(() => vi.restoreAllMocks());
it.each([
  ["smoke", "extra"], ["runtime", "status", "extra"], ["preview", "navigate", "https://example.invalid", "extra"],
  ["replay", "status", "extra"], ["replay", "cache", "compact", "extra"], ["replay", "cache", "delete", "one", "two"],
  ["repair", "status", "extra"], ["repair", "apply", "id", "--confirm=false"], ["repair", "apply", "id", "--manifest"],
  ["repair", "apply", "id", "--confirm", "--confirm"], ["repair", "apply", "id", "extra", "--confirm"],
])("rejects browser arguments %j before any runner", async (...args) => {
  const run = vi.spyOn(runner, "runBrowserCommandAsync").mockRejectedValue(new Error("unexpected runner")); const probe = vi.spyOn(smoke, "runBrowserPublicReadOnlyWebSmoke").mockRejectedValue(new Error("unexpected probe"));
  expect(parseBrowserCommandArgs(args).ok).toBe(false);
  expect((await runBrowserLocalCommand(args, { cwd: process.cwd() })).output).toContain("Outcome: blocked");
  expect(run).not.toHaveBeenCalled(); expect(probe).not.toHaveBeenCalled();
});

it("keeps exact identifiers and manifest paths without truncating to another target", () => {
  const id = "receipt-" + "a".repeat(250); const manifest = "/workspace/" + "dir/".repeat(70) + "manifest.json";
  expect(parseBrowserReplayCommandArgs([id])).toMatchObject({ ok: true, request: { receiptId: id } });
  expect(parseBrowserSelfHealingCommandArgs(["apply", id, "--manifest", manifest])).toMatchObject({ ok: true, request: { proposalId: id, manifestPath: manifest, userConfirmed: false } });
  expect(parseBrowserSelfHealingCommandArgs(["apply", id, "--confirm"])).toMatchObject({ ok: true, request: { userConfirmed: true } });
});

it("composes action and cache candidates without offering confirmation", () => {
  const values = (prefix: string) => browserCompletions(prefix)?.map(item => item.value) ?? [];
  expect(values("preview nav")).toEqual(["navigate"]);
  expect(values("replay cache de")).toEqual(["delete"]);
  expect(values("runtime ")).toEqual(["status"]);
  expect(values("repair apply proposal --c")).toEqual([]);
  expect(values("repair apply proposal ")).toEqual(["--manifest"]);
  expect(values("smoke ")).toEqual([]);
});
