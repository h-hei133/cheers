import { exec } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { recordLastAssistantResponse, setClipboardSink } from "./copyCommandRuntime.js";
import { routeSlashCommand } from "./slashRouter.js";

vi.mock("node:child_process", async () => ({ ...await vi.importActual<typeof import("node:child_process")>("node:child_process"), exec: vi.fn() }));

let root: string;
const buffers: Buffer[] = [];
const terminal = vi.fn();
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "copy-text-"));
  vi.stubEnv("HOME", root); vi.stubEnv("USERPROFILE", root);
  buffers.length = 0;
  terminal.mockClear();
  setClipboardSink(terminal);
  vi.mocked(exec).mockImplementation(((_command: string, _options: unknown, callback: (error: null, stdout: string, stderr: string) => void) => ({
    on() {}, stdin: { on() {}, end(buffer: Buffer) { buffers.push(buffer); queueMicrotask(() => callback(null, "", "")); } },
  })) as typeof exec);
});
afterEach(() => { setClipboardSink(undefined); vi.clearAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

it.each(["copy", "cp"])("passes literal /%s text to native and terminal clipboard adapters", async name => {
  const text = "  'a  b' C:\\tmp\\file\n\t中文 --text\\  ";
  const result = await routeSlashCommand(`/${name} ${text}`, { cwd: root });
  expect(result).toMatchObject({ kind: "local", output: expect.stringContaining("Copied") });
  expect(buffers).toHaveLength(1);
  const expected = process.platform === "win32" ? Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]) : Buffer.from(text);
  expect(buffers[0]).toEqual(expected);
  expect(terminal).toHaveBeenCalledOnce();
  expect(terminal).toHaveBeenCalledWith(`\x1b]52;c;${Buffer.from(text).toString("base64")}\x07`);
});

it("copies the previous response only when no explicit text was supplied", async () => {
  recordLastAssistantResponse("previous response");
  await routeSlashCommand("/copy", { cwd: root });
  expect(terminal).toHaveBeenCalledWith(`\x1b]52;c;${Buffer.from("previous response").toString("base64")}\x07`);
  vi.clearAllMocks(); buffers.length = 0;
  expect(await routeSlashCommand("/copy   \t", { cwd: root })).toMatchObject({ kind: "local", output: expect.stringContaining("Invalid /copy arguments") });
  expect(exec).not.toHaveBeenCalled();
  expect(terminal).not.toHaveBeenCalled();
});
