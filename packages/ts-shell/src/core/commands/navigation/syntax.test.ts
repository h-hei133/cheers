import { afterEach, expect, it, vi } from "vitest";
import { runResumeCommand } from "../resumeCommandRuntime.js";
import { runTreeCommand } from "../treeCommandRuntime.js";
import { runEntriesCommand } from "../entriesCommandRuntime.js";
import { routeSlashCommand } from "../slashRouter.js";
import * as transcript from "../../../session/transcript/sessionTranscript.js";
import * as store from "../../../session/store/sessionStore.js";
import { resumeSyntax, forkSyntax, treeSyntax, entriesSyntax, navigationCompletions } from "./syntax.js";

const context = { cwd: process.cwd(), sessionId: "sess_navigation_fixture" };
afterEach(() => vi.restoreAllMocks());

it.each([ ["list", "extra"], ["current", "extra"], ["panel", "extra"], ["help", "extra"],
  ["switch", "sess_one", "extra"], ["use", "sess_one", "extra"], ["fork", "here", "extra"],
  ["sess_one", "extra"], ["--unknown"], ["fork", "here", "--force"],
])("refuses malformed resume input before emitting a session action: %j", async (...args) => {
  const result = await runResumeCommand(args, context);
  expect(result).toMatchObject({ kind: "local", output: expect.stringContaining("Invalid /resume arguments") });
});

it.each(["constructor", "__proto__", "toString"])("treats %s as a reference instead of an inherited mode", async id => {
  expect(await runResumeCommand([id], context)).toEqual({ kind: "shell-action", action: "resume-session", sessionId: id });
});

it.each(["..", ".", " ../outside ", "a/b", "a\\b"])("rejects unsafe fork session IDs: %s", async id => {
  for (const args of [["fork", id]]) {
    expect(await runResumeCommand(args, context)).toMatchObject({ kind: "local", output: expect.stringContaining("Invalid session reference") });
  }
});

it("keeps fork here and bare switching separate and rejects routed fork extras", async () => {
  expect(await routeSlashCommand("/fork here extra", context)).toMatchObject({ kind: "local" });
  expect(await routeSlashCommand("/fork here", context)).toEqual({ kind: "shell-action", action: "fork-session" });
  expect(await routeSlashCommand('/resume switch "My session title"', context)).toMatchObject({ action: "list-sessions", sessionId: "My session title" });
  expect(await runResumeCommand(["USE", "sess_Target"], context)).toMatchObject({ action: "list-sessions", sessionAction: "switch", sessionId: "sess_Target" });
});

it('shares direct lifecycle commands with the session grammar and rejects invalid arguments', async () => {
  expect(await routeSlashCommand('/new', context)).toEqual({ kind: 'shell-action', action: 'clear-session' });
  expect(await routeSlashCommand('/session new', context)).toEqual({ kind: 'shell-action', action: 'clear-session' });
  expect(await routeSlashCommand('/rename New session title', context)).toMatchObject({ action: 'manage-session', sessionOperation: 'rename', sessionTitle: 'New session title' });
  expect(await routeSlashCommand('/rename', context)).toEqual({ kind: 'shell-action', action: 'manage-session', sessionOperation: 'rename' });
  expect(await routeSlashCommand('/session rename "Saved work" Revised title', context)).toMatchObject({ action: 'manage-session', sessionOperation: 'rename', sessionId: 'Saved work', sessionTitle: 'Revised title' });
  expect(await routeSlashCommand('/delete "Saved work"', context)).toMatchObject({ action: 'manage-session', sessionOperation: 'delete', sessionId: 'Saved work' });
  for (const command of ['/delete', '/delete first extra', '/delete --yes first', '/rename --force title', '/new extra', '/session new extra', '/session delete', '/session rename']) {
    expect(await routeSlashCommand(command, context)).toMatchObject({ kind: 'local', output: expect.stringMatching(/Invalid|does not accept/) });
  }
});

it.each([ ["tree", "entry", "extra"], ["cursor", "extra"], ["help", "extra"], ["--unknown"] ])("does not read entries for malformed arguments: %j", async (...args) => {
  const read = vi.spyOn(transcript, "readTranscriptEvents");
  const load = vi.spyOn(store, "loadSessionRecord");
  expect(await runEntriesCommand(args, context)).toMatchObject({ output: expect.stringContaining("Invalid /entries arguments") });
  expect(read).not.toHaveBeenCalled(); expect(load).not.toHaveBeenCalled();
});

it("keeps tree navigation explicit and refuses extra or unknown flag input", async () => {
  expect(await runTreeCommand([])).toEqual({ kind: "shell-action", action: "navigate-session" });
  expect(await runTreeCommand(["entry_a"])).toEqual({ kind: "shell-action", action: "navigate-session", entryId: "entry_a" });
  expect(await runTreeCommand(["--help"])).toMatchObject({ kind: "local" });
  for (const args of [["entry_a", "extra"], ["--unknown"], ["help", "extra"]]) {
    expect(await runTreeCommand(args)).toMatchObject({ kind: "local", output: expect.stringContaining("Invalid /tree arguments") });
  }
});

it("projects real actions and the current-session fork target only where legal", () => {
  const values = (syntax: typeof resumeSyntax, prefix: string) => navigationCompletions(syntax, prefix)?.map(item => item.value) ?? [];
  expect(values(resumeSyntax, "")).toContain("fork");
  expect(values(resumeSyntax, "ac")).toEqual(["active"]);
  expect(values(resumeSyntax, "fork h")).toEqual(["here"]);
  expect(values(forkSyntax, "h")).toEqual(["here"]);
  expect(values(resumeSyntax, "current ")).toEqual([]);
  expect(values(forkSyntax, "here ")).toEqual([]);
  expect(values(entriesSyntax, "")).toEqual(["tree", "help"]);
  expect(values(treeSyntax, "--h")).toEqual(["--help"]);
});
