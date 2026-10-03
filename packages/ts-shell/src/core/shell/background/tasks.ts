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
import { createOutputSink } from "./output.js";

/** How much of a command's output is kept. */
const OUTPUT_BYTES = 64 * 1024;
const COMPLETED_TASK_LIMIT = 100;

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
  /**
   * Whether earlier output was dropped to stay within the bound.
   *
   * Carried rather than inferred from the length: a reader shown a clipped tail
   * with nothing to say so would take it for the whole of what the command
   * printed, and act on a report whose beginning is missing.
   */
  readonly outputTruncated?: boolean;
  /**
   * Where the whole output went, once it outgrew what is kept in memory.
   *
   * Present only when the output was long enough to be written out. Without it a
   * reader would have to take the notice at its word and had no way to see the
   * beginning; with it the notice can name a file they can open.
   */
  readonly outputPath?: string;
  /** Set when the command could not be started at all. */
  readonly failure?: string;
}

/** What a caller may do with a background command. */
export interface BackgroundRunner {
  start(input: {
    readonly command: string;
    readonly cwd: string;
    readonly env?: Readonly<Record<string, string>>;
    readonly shell?: { readonly command: string; readonly args: readonly string[] };
  }): BackgroundTask;
  /** Running tasks and the most recently completed 100 tasks. */
  list(): readonly BackgroundTask[];
  /** Older completed tasks are evicted from memory; their spill files remain. */
  get(id: string): BackgroundTask | undefined;
  /** Stop one, which signals its whole process group. */
  stop(id: string): Promise<boolean>;
  /**
   * Called when a command ends, so the conversation can be told.
   *
   * The return value stops the subscription. A listener that cannot be removed
   * outlives the surface that wanted it, because the registry is a process
   * singleton and nothing else would ever forget it.
   */
  onEnded(listener: (task: BackgroundTask) => void): () => void;
}

/**
 * The registry of commands that outlive the turn that started them.
 *
 * Exported so a test can own one outright: the shared instance keeps state for
 * the life of the process, which is right for the product and wrong for a test
 * that asserts on what a single command did.
 */
export class TaskRegistry {
  private static instance?: TaskRegistry;
  private readonly tasks = new Map<string, BackgroundTask>();
  private readonly children = new Map<string, ChildProcess>();
  private readonly listeners: Array<(task: BackgroundTask) => void> = [];
  private nextId = 1;
  /**
   * Where output past the in-memory limit is written.
   *
   * Settable because only a caller with a session knows where that session's
   * files belong. Unset means memory only, which is a smaller loss than guessing
   * at a directory and writing somewhere the session does not own.
   */
  spillDirectory: string | undefined;

  static getShared(): TaskRegistry {
    if (!TaskRegistry.instance) TaskRegistry.instance = new TaskRegistry();
    return TaskRegistry.instance;
  }

  /**
   * Be told when a command ends.
   *
   * Returns the way to stop being told. A subscriber that cannot unsubscribe is
   * a listener that lives as long as the registry does, and the registry is a
   * process singleton — so a session that restarted its subscriber would keep
   * notifying the old one for the rest of the process's life.
   */
  onEnded(listener: (task: BackgroundTask) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const at = this.listeners.indexOf(listener);
      if (at !== -1) this.listeners.splice(at, 1);
    };
  }

  list(): readonly BackgroundTask[] {
    return [...this.tasks.values()];
  }

  get(id: string): BackgroundTask | undefined {
    return this.tasks.get(id);
  }

  private retain(task: BackgroundTask): void {
    // Move completions behind older completions, regardless of start order.
    this.tasks.delete(task.id);
    this.tasks.set(task.id, task);
    let excess = [...this.tasks.values()].filter(entry => entry.state !== "running").length - COMPLETED_TASK_LIMIT;
    for (const [id, entry] of this.tasks) {
      if (excess <= 0) break;
      if (entry.state !== "running") { this.tasks.delete(id); excess--; }
    }
  }

  start(input: {
    readonly command: string;
    readonly cwd: string;
    readonly env?: Readonly<Record<string, string>>;
    /**
     * The program and arguments to launch instead of the platform shell.
     *
     * A caller that has already planned the launch passes them here, so the
     * command it starts is the one it planned — an isolation launcher, for
     * instance, rather than the bare shell it was meant to wrap.
     */
    readonly shell?: { readonly command: string; readonly args: readonly string[] };
  }): BackgroundTask {
    const id = `bg_${this.nextId++}`;
    const shell = input.shell?.command ?? (process.platform === "win32" ? "cmd.exe" : "/bin/sh");
    const shellArgs = input.shell
      ? [...input.shell.args]
      : process.platform === "win32"
        ? ["/d", "/s", "/c", input.command]
        : ["-c", input.command];

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
      this.retain(failed);
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

    const sink = createOutputSink({
      limitBytes: OUTPUT_BYTES,
      label: id,
      ...(this.spillDirectory ? { spillDirectory: this.spillDirectory } : {}),
    });
    const append = (text: string): void => {
      const pending = sink.append(text);
      if (pending) {
        child.stdout?.pause();
        child.stderr?.pause();
        void pending.then(() => { child.stdout?.resume(); child.stderr?.resume(); });
      }
      task = {
        ...task,
        output: sink.tail,
        ...(sink.truncated ? { outputTruncated: true } : {}),
        get outputPath() { return sink.spillPath; },
      };
      this.tasks.set(id, task);
    };
    // Each pipe has its own streaming decoder, including split UTF-8 sequences.
    child.stdout?.setEncoding("utf8").on("data", append);
    child.stderr?.setEncoding("utf8").on("data", append);

    // A child that cannot be spawned reports both an error and a close, so the
    // ending is recorded once: a caller told twice would run its follow-up
    // twice, and the second notice would arrive after the task was already gone.
    let ended = false;
    const finish = async (state: "exited" | "killed", code: number | null): Promise<void> => {
      if (ended) return;
      ended = true;
      this.children.delete(id);
      if (child.pid) untrackChildPid(child.pid);
      await sink.close();
      const finished: BackgroundTask = { ...task, state, exitCode: code ?? undefined, output: sink.tail, outputTruncated: sink.truncated, outputPath: sink.spillPath };
      this.retain(finished);
      // Told once. A caller that missed it can still see the finished state by
      // asking, so a listener that arrives late loses nothing.
      for (const listener of this.listeners) listener(finished);
    };
    child.on("error", (error) => {
      task = { ...task, failure: error.message };
      append(`\n${error.message}\n`);
      void finish("exited", null);
    });
    child.on("close", (code, signal) => { void finish(signal ? "killed" : "exited", code); });

    return task;
  }

  /**
   * Stop a command.
   *
   * The whole group is signalled, not the direct child, because a shell's
   * children outlive it — and they are the ones holding the pipes, which is how a
   * stopped command leaves a caller waiting for output that will never come.
   */
  async stop(id: string): Promise<boolean> {
    const child = this.children.get(id);
    if (!child) return false;
    if (child.pid) await killProcessTree(child.pid);
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
    if (task.outputTruncated) {
      lines.push(
        task.outputPath
          ? `  (earlier output is in ${task.outputPath})`
          : "  (earlier output was dropped to stay within the size limit)",
      );
    }
    lines.push("  output so far:", task.output.split("\n").map((line) => `    ${line}`).join("\n"));
  }
  return lines.join("\n");
}

/**
 * What the user is told when a background command ends.
 *
 * Phrased as something to act on rather than a status line: the command was
 * started so its result could be used later, and the moment it ends is when that
 * becomes possible. The tail of its output travels with the notice because the
 * only other way to get it is a second tool call.
 */
export function renderTaskNotice(task: Parameters<typeof renderTask>[0]): string {
  return `A background command finished.\n\n${renderTask(task)}\n\nUse taskOutput to inspect retained task results.`;
}
