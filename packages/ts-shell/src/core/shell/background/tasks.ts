/**
 * Commands that outlive the turn that started them.
 *
 * A build or a test run can take longer than anyone wants to wait with the turn
 * held open, and until now there was no way to start one and come back to it. The
 * pieces were already here — the shell already puts each command in its own
 * process group and tracks it — so what was missing was a place to keep the ones
 * that are still running and a way to ask about them.
 *
 * Output is bounded rather than kept whole. A command can print without limit,
 * and holding all of it would be a memory leak with a friendly name; what is kept
 * is the end, because that is where a failure says what went wrong.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { trackChildPid, untrackChildPid, killProcessTree } from "../platform/processTree.js";

/** How much of a command's output is kept. */
const OUTPUT_BYTES = 64 * 1024;

/** One running command. */
export interface BackgroundTask {
  readonly id: string;
  readonly command: string;
  readonly cwd: string;
  readonly pid: number | undefined;
  readonly startedAt: number;
  readonly state: "running" | "exited" | "killed";
  readonly exitCode?: number;
  /** The output so far, oldest first and bounded. */
  readonly output: string;
  /** Set when the command could not be started at all. */
  readonly failure?: string;
}

/** What a caller may do with a background command. */
export interface BackgroundRunner {
  start(input: { readonly command: string; readonly cwd: string; readonly env?: Readonly<Record<string, string>> }): BackgroundTask;
  list(): readonly BackgroundTask[];
  get(id: string): BackgroundTask | undefined;
  /** Stop one, which signals its whole process group. */
  stop(id: string): boolean;
  /** Called when a command ends, so the conversation can be told. */
  onEnded(listener: (task: BackgroundTask) => void): void;
}

/**
 * Keeping output from growing without bound.
 *
 * The tail rather than the head: a command that fails says why at the end, and a
 * command's beginning is usually the part a reader already knows. Slicing on a
 * character count is an approximation of a byte limit that is exact enough here —
 * the cost of being wrong is a few kilobytes either way.
 */
function keepTail(current: string, addition: string): string {
  const combined = current + addition;
  if (combined.length <= OUTPUT_BYTES) return combined;
  return combined.slice(combined.length - OUTPUT_BYTES);
}

/** The shared registry of commands that outlive the turn that started them. */
class TaskRegistry {
  private static instance?: TaskRegistry;
  private readonly tasks = new Map<string, BackgroundTask>();
  private readonly children = new Map<string, ChildProcess>();
  private readonly listeners: Array<(task: BackgroundTask) => void> = [];
  private nextId = 1;

  static getShared(): TaskRegistry {
    if (!TaskRegistry.instance) TaskRegistry.instance = new TaskRegistry();
    return TaskRegistry.instance;
  }

  onEnded(listener: (task: BackgroundTask) => void): void {
    this.listeners.push(listener);
  }

  list(): readonly BackgroundTask[] {
    return [...this.tasks.values()];
  }

  get(id: string): BackgroundTask | undefined {
    return this.tasks.get(id);
  }

  start(input: {
    readonly command: string;
    readonly cwd: string;
    readonly env?: Readonly<Record<string, string>>;
  }): BackgroundTask {
    const id = `bg_${this.nextId++}`;
    const shell = process.platform === "win32" ? "cmd.exe" : "/bin/sh";
    const shellArgs = process.platform === "win32" ? ["/d", "/s", "/c", input.command] : ["-c", input.command];

    let child: ChildProcess;
    try {
      child = spawn(shell, shellArgs, {
        cwd: input.cwd,
        windowsHide: true,
        ...(input.env ? { env: { ...process.env, ...input.env } } : {}),
        // Its own group, so stopping it stops what it started. Killing only the
        // shell leaves a compiler or a server running with nobody watching it.
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      const failed: BackgroundTask = {
        id,
        command: input.command,
        cwd: input.cwd,
        pid: undefined,
        startedAt: Date.now(),
        state: "exited",
        output: "",
        failure: error instanceof Error ? error.message : String(error),
      };
      this.tasks.set(id, failed);
      return failed;
    }

    if (child.pid) trackChildPid(child.pid);

    let task: BackgroundTask = {
      id,
      command: input.command,
      cwd: input.cwd,
      pid: child.pid,
      startedAt: Date.now(),
      state: "running",
      output: "",
    };
    this.tasks.set(id, task);
    this.children.set(id, child);

    const append = (text: string): void => {
      task = { ...task, output: keepTail(task.output, text) };
      this.tasks.set(id, task);
    };
    child.stdout?.on("data", (chunk: Buffer) => append(chunk.toString()));
    child.stderr?.on("data", (chunk: Buffer) => append(chunk.toString()));

    const finish = (state: "exited" | "killed", code: number | null): void => {
      const ended: BackgroundTask = { ...task, state, exitCode: code ?? undefined };
      this.tasks.set(id, ended);
      this.children.delete(id);
      if (child.pid) untrackChildPid(child.pid);
      // Told once. A caller that missed it can still see the finished state by
      // asking, so a listener that arrives late loses nothing.
      for (const listener of this.listeners) listener(ended);
    };
    child.on("error", (error) => {
      append(`\n${error.message}\n`);
      finish("exited", null);
    });
    child.on("close", (code, signal) => finish(signal ? "killed" : "exited", code));

    return task;
  }

  /**
   * Stop a command.
   *
   * The whole group is signalled, not the direct child, because a shell's
   * children outlive it — and they are the ones holding the pipes, which is how a
   * stopped command leaves a caller waiting for output that will never come.
   */
  stop(id: string): boolean {
    const child = this.children.get(id);
    if (!child) return false;
    if (child.pid) killProcessTree(child.pid);
    else child.kill("SIGKILL");
    return true;
  }
}

/** The registry every background command in this process belongs to. */
export const backgroundTasks: BackgroundRunner = {
  start: (input) => TaskRegistry.getShared().start(input),
  list: () => TaskRegistry.getShared().list(),
  get: (id) => TaskRegistry.getShared().get(id),
  stop: (id) => TaskRegistry.getShared().stop(id),
  onEnded: (listener) => TaskRegistry.getShared().onEnded(listener),
};

/**
 * The text a model is shown for one command.
 *
 * What a reader needs is whether it is still going, how it ended if it is not,
 * and the end of what it printed. The beginning of the output is dropped by the
 * bound above, so the note says so rather than letting a reader believe they are
 * seeing everything.
 */
export function renderTask(task: BackgroundTask): string {
  const state =
    task.state === "running"
      ? "still running"
      : task.state === "killed"
        ? "stopped"
        : `finished with exit code ${task.exitCode ?? "unknown"}`;
  const lines = [`${task.id}: ${task.command}`, `  ${state}, started ${new Date(task.startedAt).toISOString()}`];
  if (task.failure) lines.push(`  could not start: ${task.failure}`);
  if (task.output) {
    lines.push("  output so far:", task.output.split("\n").map((line) => `    ${line}`).join("\n"));
  }
  return lines.join("\n");
}
