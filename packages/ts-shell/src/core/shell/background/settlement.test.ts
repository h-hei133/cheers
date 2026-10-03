import { afterEach, describe, expect, it, vi } from "vitest";
import { ChildProcess } from "node:child_process";
import { PassThrough } from "node:stream";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TaskRegistry } from "./tasks.js";
import { createOutputSink } from "./output.js";

const { launch, makeSink } = vi.hoisted(() => ({ launch: vi.fn(), makeSink: vi.fn() }));
vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  launch.mockImplementation(actual.spawn);
  return { ...actual, spawn: launch };
});
vi.mock("./output.js", async () => {
  const actual = await vi.importActual<typeof import("./output.js")>("./output.js");
  makeSink.mockImplementation(actual.createOutputSink);
  return { ...actual, createOutputSink: makeSink };
});

afterEach(async () => {
  launch.mockReset().mockImplementation((await vi.importActual<typeof import("node:child_process")>("node:child_process")).spawn);
  makeSink.mockReset().mockImplementation((await vi.importActual<typeof import("./output.js")>("./output.js")).createOutputSink);
});

async function until(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("Background task did not settle");
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

describe("background output settlement", () => {
  it("pauses both pipes on backpressure and refreshes failed spill state before notifying", async () => {
    const child = new ChildProcess();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    launch.mockReturnValue(child);
    let drain!: () => void;
    let close!: () => void;
    const pending = new Promise<void>(resolve => { drain = resolve; });
    const closing = new Promise<void>(resolve => { close = resolve; });
    let spillPath: string | undefined = "initial.log";
    const append = vi.fn().mockReturnValueOnce(pending);
    const sink: ReturnType<typeof createOutputSink> = {
      append, tail: "tail", truncated: true, get spillPath() { return spillPath; }, close: () => closing,
    };
    makeSink.mockReturnValue(sink);
    const registry = new TaskRegistry();
    const ended = vi.fn();
    registry.onEnded(ended);
    const task = registry.start({ command: "synthetic child", cwd: process.cwd() });
    child.stdout.emit("data", "prefix");
    expect(child.stdout.isPaused()).toBe(true);
    expect(child.stderr.isPaused()).toBe(true);
    expect(registry.get(task.id)?.outputPath).toBe("initial.log");
    spillPath = undefined;
    expect(registry.get(task.id)?.outputPath).toBeUndefined();
    drain();
    await pending;
    await until(() => !child.stdout!.isPaused() && !child.stderr!.isPaused());
    expect(child.stdout.isPaused()).toBe(false);
    expect(child.stderr.isPaused()).toBe(false);
    child.emit("close", 0, null);
    expect(registry.get(task.id)?.state).toBe("running");
    expect(ended).not.toHaveBeenCalled();
    expect(await registry.stop(task.id)).toBe(false);
    close();
    await closing;
    expect(registry.get(task.id)).toMatchObject({ state: "exited", exitCode: 0, output: "tail", outputTruncated: true });
    expect(registry.get(task.id)?.outputPath).toBeUndefined();
    expect(ended).toHaveBeenCalledTimes(1);
  });

  it("decodes split UTF-8 independently on each pipe", async () => {
    const child = new ChildProcess();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    launch.mockReturnValue(child);
    const registry = new TaskRegistry();
    const task = registry.start({ command: "split output", cwd: process.cwd() });
    const stdout = Buffer.from("中");
    const stderr = Buffer.from("🙂");
    child.stdout.write(stdout.subarray(0, 1));
    child.stderr.write(stderr.subarray(0, 2));
    child.stdout.end(stdout.subarray(1));
    child.stderr.end(stderr.subarray(2));
    child.emit("close", 0, null);
    await until(() => registry.get(task.id)?.state === "exited");
    expect(registry.get(task.id)?.output).toBe("中🙂");
  });

  it("retains the latest completed tasks without evicting a running task", async () => {
    const children: ChildProcess[] = [];
    launch.mockImplementation(() => { const child = new ChildProcess(); children.push(child); return child; });
    const registry = new TaskRegistry();
    const running = registry.start({ command: "held", cwd: process.cwd() });
    const completed: string[] = [];
    for (let index = 0; index < 105; index++) {
      const task = registry.start({ command: "finished", cwd: process.cwd() });
      completed.push(task.id);
      children.at(-1)!.emit("close", 0, null);
      await Promise.resolve();
    }
    expect(registry.get(running.id)?.state).toBe("running");
    expect(registry.list()).toHaveLength(101);
    expect(registry.get(completed[4]!)).toBeUndefined();
    expect(registry.get(completed[5]!)?.state).toBe("exited");
    children[0]!.emit("close", 0, null);
    await Promise.resolve();
    expect(registry.list()).toHaveLength(100);
    expect(registry.list().at(-1)?.id).toBe(running.id);
    expect(registry.get(completed[5]!)).toBeUndefined();
  });

  it("publishes a complete spill readable from the ended callback after real process output", async () => {
    const directory = await mkdtemp(join(tmpdir(), "background-settlement-"));
    const registry = new TaskRegistry();
    registry.spillDirectory = directory;
    const payload = "FIRST\n" + "中🙂".repeat(40_000) + "\nLAST\n";
    const finished = new Promise<string>((resolve, reject) => {
      registry.onEnded(task => {
        if (!task.outputPath) { reject(new Error("No complete spill published")); return; }
        void readFile(task.outputPath, "utf8").then(resolve, reject);
      });
    });
    const task = registry.start({
      command: "large UTF-8 output", cwd: directory,
      shell: { command: process.execPath, args: ["-e", "process.stdout.write('FIRST\\n' + '中🙂'.repeat(40000) + '\\nLAST\\n')"] },
    });
    try {
      expect(await finished).toBe(payload);
      const result = registry.get(task.id)!;
      expect(result.state).toBe("exited");
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain("LAST");
      expect(result.output).not.toContain("�");
      expect(Buffer.byteLength(result.output)).toBeLessThanOrEqual(64 * 1024);
    } finally {
      await registry.stop(task.id);
      await rm(directory, { recursive: true, force: true });
    }
  });
});
