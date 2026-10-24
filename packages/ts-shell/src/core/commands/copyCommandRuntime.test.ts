import { exec } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { recordLastAssistantResponse, runCopyCommand, setClipboardSink } from "./copyCommandRuntime.js";
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

it.each(['cancelled', 'blocked'] as const)('stops fresh clipboard fallbacks after %s authority while retaining a dispatched offer', async reason => {
  const controller = new AbortController();
  let blocked = false;
  vi.mocked(exec).mockImplementation(((_command: string, _options: unknown, callback: (error: Error) => void) => ({
    on() {}, stdin: { on() {}, end() { queueMicrotask(() => {
      if (reason === 'cancelled') controller.abort();
      else blocked = true;
      callback(new Error('clipboard unavailable'));
    }); } },
  })) as typeof exec);
  const result = await runCopyCommand(['bound raw source'], { cwd: root, signal: controller.signal,
    admission: () => blocked ? 'PRIVATE_DENIAL_DETAIL' : undefined });
  expect(exec).toHaveBeenCalledOnce();
  expect(terminal).toHaveBeenCalledOnce();
  expect(result).toMatchObject({ state: { clipboard: 'offered', clipboardAttempts: reason } });
  expect(result.output).toContain(`Further clipboard attempts were ${reason}`);
  expect(result.output).not.toMatch(/Copied|PRIVATE/);
});

it('refuses expired authority before terminal or native clipboard dispatch', async () => {
  for (const context of [
    { signal: AbortSignal.abort() },
    { admission: () => 'PRIVATE_DENIAL_DETAIL' },
    { admission: () => { throw new Error('PRIVATE_ADMISSION_ERROR'); } },
  ]) {
    const result = await runCopyCommand(['source'], { cwd: root, ...context });
    expect(result.output).not.toMatch(/Sent|Copied|PRIVATE/);
    expect(result.state?.clipboard).toBe('unavailable');
    expect(result.state?.clipboardAttempts).toMatch(/cancelled|blocked/);
  }
  expect(exec).not.toHaveBeenCalled();
  expect(terminal).not.toHaveBeenCalled();
});

it.each([1, 2])('refuses clipboard dispatch when admission callback %s cancels the original signal', async phase => {
  const controller = new AbortController(); let checks = 0;
  const result = await runCopyCommand(['source'], { cwd: root, signal: controller.signal,
    admission: () => { if (++checks === phase) controller.abort(); return undefined; } });
  expect(exec).not.toHaveBeenCalled(); expect(terminal).toHaveBeenCalledTimes(phase === 1 ? 0 : 1);
  expect(result.state).toEqual({ clipboard: phase === 1 ? 'unavailable' : 'offered', clipboardAttempts: 'cancelled' });
  expect(result.output).not.toContain('Copied');
});

it('reports a successful already-dispatched native write after cancellation without another attempt', async () => {
  const controller = new AbortController();
  vi.mocked(exec).mockImplementation(((_command: string, _options: unknown, callback: (error: null) => void) => ({
    on() {}, stdin: { on() {}, end() { queueMicrotask(() => { controller.abort(); callback(null); }); } },
  })) as typeof exec);
  expect(await runCopyCommand(['source'], { cwd: root, signal: controller.signal })).toMatchObject({
    state: { clipboard: 'copied' }, output: expect.stringContaining('Copied'),
  });
  expect(exec).toHaveBeenCalledOnce();
});

it.each(['darwin', 'win32'] as const)('retains cancellation after the only native candidate on %s', async platform => {
  const original = Object.getOwnPropertyDescriptor(process, 'platform')!;
  const controller = new AbortController();
  vi.mocked(exec).mockImplementation(((_command: string, _options: unknown, callback: (error: Error) => void) => ({
    on() {}, stdin: { on() {}, end() { queueMicrotask(() => { controller.abort(); callback(new Error('unavailable')); }); } },
  })) as typeof exec);
  try {
    Object.defineProperty(process, 'platform', { ...original, value: platform });
    const result = await runCopyCommand(['source'], { cwd: root, signal: controller.signal });
    expect(result.state).toEqual({ clipboard: 'offered', clipboardAttempts: 'cancelled' });
    expect(exec).toHaveBeenCalledOnce();
  } finally {
    Object.defineProperty(process, 'platform', original);
  }
});

it('counts every raw source line without allocating a full line array', async () => {
  const split = vi.spyOn(String.prototype, 'split');
  const result = await runCopyCommand(['first\n\nlast\n'], { cwd: root });
  const lineSplits = split.mock.instances.filter(value => value === 'first\n\nlast\n').length;
  split.mockRestore();
  expect(result.output).toContain('12 characters across 4 lines');
  expect(lineSplits).toBe(0);
});
