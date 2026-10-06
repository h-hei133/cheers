import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as memoryTools from "../memory/memoryTools.js";
import { routeSlashCommand } from "./slashRouter.js";
import { runMemoryCommand } from "./memoryCommandRuntime.js";

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "memory-text-"));
  vi.stubEnv("HOME", root); vi.stubEnv("USERPROFILE", root);
  vi.spyOn(memoryTools, "executeMemoryRecall").mockResolvedValue("Recall result");
  vi.spyOn(memoryTools, "executeMemoryRetain").mockResolvedValue("Retention result");
});
afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});

it.each(["recall", "retain", "RECALL", "RETAIN"])("passes /%s prose intact to its own memory operation", async name => {
  const body = "  don't rewrite 'a  b' or C:\\tmp\\file\n\t--literal\\  ";
  const result = await routeSlashCommand(`/${name} ${body}`, { cwd: root });
  if (name.toLowerCase() === "recall") {
    expect(memoryTools.executeMemoryRecall).toHaveBeenCalledOnce();
    expect(memoryTools.executeMemoryRecall).toHaveBeenCalledWith({ query: body });
    expect(memoryTools.executeMemoryRetain).not.toHaveBeenCalled();
    expect(result).toEqual({ kind: "local", output: "Recall result" });
  } else {
    expect(memoryTools.executeMemoryRetain).toHaveBeenCalledOnce();
    expect(memoryTools.executeMemoryRetain).toHaveBeenCalledWith({ items: [{ statement: body }] });
    expect(memoryTools.executeMemoryRecall).not.toHaveBeenCalled();
    expect(result).toEqual({ kind: "local", output: "Retention result" });
  }
});

it.each(["recall", "retain"])("accepts a trailing backslash and CRLF separator in /%s", async name => {
  const body = "look in C:\\tmp\\";
  await routeSlashCommand(`/${name}\r\n${body}`, { cwd: root });
  if (name === "recall") expect(memoryTools.executeMemoryRecall).toHaveBeenCalledWith({ query: body });
  else expect(memoryTools.executeMemoryRetain).toHaveBeenCalledWith({ items: [{ statement: body }] });
});

it.each(["/recall", "/recall  \t\n", "/retain", "/retain  \t\n"])("does not search or retain a missing body: %s", async input => {
  const name = input.slice(1).trim();
  const parameter = name === "recall" ? "query" : "statement";
  expect(await routeSlashCommand(input, { cwd: root })).toMatchObject({
    kind: "local", output: expect.stringContaining(`Usage: /${name} <${parameter}>`),
  });
  expect(memoryTools.executeMemoryRecall).not.toHaveBeenCalled();
  expect(memoryTools.executeMemoryRetain).not.toHaveBeenCalled();
});

it("keeps direct handler compatibility and gives explicit raw text precedence", async () => {
  await runMemoryCommand(["first", "second"], { cwd: root, rawCommandName: "recall" });
  expect(memoryTools.executeMemoryRecall).toHaveBeenCalledWith({ query: "first second" });
  const statement = "  original\tstatement  ";
  await runMemoryCommand(["decoded"], { cwd: root, rawCommandName: "retain", rawCommandArgs: statement });
  expect(memoryTools.executeMemoryRetain).toHaveBeenCalledWith({ items: [{ statement }] });
});

it("keeps /memory action parsing separate from literal named invocations", async () => {
  await routeSlashCommand('/memory add "quoted statement"', { cwd: root });
  expect(memoryTools.executeMemoryRetain).toHaveBeenCalledWith({ items: [{ statement: "quoted statement", category: "convention" }] });
});

it("does not turn a failed memory operation into a success result", async () => {
  vi.mocked(memoryTools.executeMemoryRetain).mockRejectedValueOnce(new Error("retention unavailable"));
  await expect(routeSlashCommand("/retain a statement", { cwd: root })).rejects.toThrow("retention unavailable");
  expect(memoryTools.executeMemoryRetain).toHaveBeenCalledOnce();
});
