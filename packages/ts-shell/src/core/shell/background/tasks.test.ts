import { describe, expect, it } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backgroundTasks, TaskRegistry, renderTask } from "./tasks.js";

/**
 * Commands that outlive the turn that started them.
 *
 * These spawn real processes rather than a stand-in, because the thing being
 * checked is whether a command that is not waited on can still be asked about and
 * stopped — and that is a question about a process, not about a registry.
 *
 * Each case waits for the state it asserts rather than sleeping a fixed amount,
 * so a slow machine makes the test slower rather than flaky.
 */

/** Wait until a condition holds, or give up. */
async function until(check: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("the condition never held");
}

/** A directory to run commands in. */
async function somewhere(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "bg-"));
}

describe("starting a command in the background", () => {
  it("returns a handle instead of waiting for the command", async () => {
    // The point of the feature: a build that takes minutes must not hold the turn
    // open, and what comes back is how to ask about it later.
    const task = backgroundTasks.start({ command: "echo hello", cwd: await somewhere() });

    expect(task.id).toMatch(/^bg_\d+$/);
    expect(task.state).toBe("running");
  });

  it("collects what the command printed", async () => {
    const task = backgroundTasks.start({ command: "echo from-the-background", cwd: await somewhere() });

    await until(() => backgroundTasks.get(task.id)?.state !== "running");
    expect(backgroundTasks.get(task.id)?.output).toContain("from-the-background");
  });

  it("reports how a command ended", async () => {
    const task = backgroundTasks.start({ command: "exit 3", cwd: await somewhere() });

    await until(() => backgroundTasks.get(task.id)?.state !== "running");
    const ended = backgroundTasks.get(task.id)!;
    expect(ended.state).toBe("exited");
    expect(ended.exitCode).toBe(3);
  });

  it("collects output from a command that failed", async () => {
    const task = backgroundTasks.start({ command: "echo bad-thing >&2; exit 1", cwd: await somewhere() });

    await until(() => backgroundTasks.get(task.id)?.state !== "running");
    expect(backgroundTasks.get(task.id)?.output).toContain("bad-thing");
  });

  it("keeps the end of a command's output rather than all of it", async () => {
    // A command can print without limit, so what is kept is bounded. The tail is
    // what is kept because that is where a failure says what went wrong.
    const task = backgroundTasks.start({
      command: `for i in $(seq 1 20000); do echo "line $i padding padding padding"; done`,
      cwd: await somewhere(),
    });

    await until(() => backgroundTasks.get(task.id)?.state !== "running", 20_000);
    const output = backgroundTasks.get(task.id)!.output;
    expect(output).toContain("line 20000");
    expect(output.length).toBeLessThanOrEqual(64 * 1024);
  });

  it("tells a listener when a command ends", async () => {
    // This is how the conversation finds out without being polled.
    const ended: string[] = [];
    backgroundTasks.onEnded((task) => ended.push(task.id));

    const task = backgroundTasks.start({ command: "exit 0", cwd: await somewhere() });

    await until(() => ended.includes(task.id));
    expect(backgroundTasks.get(task.id)!.state).toBe("exited");
  });

  it("reports a command that could not be started at all", async () => {
    // A working directory that does not exist is the case. Starting is not where
    // it fails — the process reports it a moment later — so the failure lands on
    // the handle rather than being thrown at a caller that already has it.
    const task = backgroundTasks.start({ command: "echo x", cwd: "/nonexistent-directory-for-a-test" });

    await until(() => backgroundTasks.get(task.id)?.state === 'exited');
    const failed = backgroundTasks.get(task.id)!;
    expect(failed.state).toBe("exited");
    expect(failed.failure ?? failed.output).toMatch(/ENOENT|no such file/i);
  });
});

describe("stopping a command", () => {
  it("ends a command that would otherwise run on", async () => {
    const task = backgroundTasks.start({ command: "sleep 30", cwd: await somewhere() });

    expect(await backgroundTasks.stop(task.id)).toBe(true);
    await until(() => backgroundTasks.get(task.id)?.state !== "running");
    expect(backgroundTasks.get(task.id)!.state).toBe("killed");
  });

  it("stops the whole group, not just the shell it started", async () => {
    // A shell's children outlive it, and they are the ones holding the pipes —
    // which is how a stopped command leaves a reader waiting for output that will
    // never come.
    const task = backgroundTasks.start({ command: "sh -c 'sleep 30' & sleep 30", cwd: await somewhere() });
    await new Promise((resolve) => setTimeout(resolve, 200));

    await backgroundTasks.stop(task.id);
    await until(() => backgroundTasks.get(task.id)?.state !== "running");
    expect(backgroundTasks.get(task.id)!.state).toBe("killed");
  });

  it("refuses a name it does not know rather than reporting success", async () => {
    // A caller that believes it stopped something and did not has a process still
    // running under a name it will not ask about again.
    expect(await backgroundTasks.stop("bg_does_not_exist")).toBe(false);
  });

  it("reports a command that has already ended", async () => {
    const task = backgroundTasks.start({ command: "exit 0", cwd: await somewhere() });
    await until(() => backgroundTasks.get(task.id)?.state !== "running");

    expect(await backgroundTasks.stop(task.id)).toBe(false);
  });
});

describe("what a reader is shown", () => {
  it("says a command is still running", async () => {
    const task = backgroundTasks.start({ command: "sleep 30", cwd: await somewhere() });

    expect(renderTask(backgroundTasks.get(task.id)!)).toContain("still running");
    await backgroundTasks.stop(task.id);
    await until(() => backgroundTasks.get(task.id)?.state !== "running");
  });

  it("names the exit code of a command that finished", async () => {
    const task = backgroundTasks.start({ command: "exit 7", cwd: await somewhere() });
    await until(() => backgroundTasks.get(task.id)?.state !== "running");

    expect(renderTask(backgroundTasks.get(task.id)!)).toContain("exit code 7");
  });

  it("includes what the command printed", async () => {
    const task = backgroundTasks.start({ command: "echo readable", cwd: await somewhere() });
    await until(() => backgroundTasks.get(task.id)?.state !== "running");

    expect(renderTask(backgroundTasks.get(task.id)!)).toContain("readable");
  });
});

describe("the list", () => {
  it("holds every command that was started", async () => {
    const before = backgroundTasks.list().length;
    const one = backgroundTasks.start({ command: "echo a", cwd: await somewhere() });
    const two = backgroundTasks.start({ command: "echo b", cwd: await somewhere() });

    const ids = backgroundTasks.list().map((task) => task.id);
    expect(backgroundTasks.list().length).toBeGreaterThanOrEqual(before + 2);
    expect(ids).toContain(one.id);
    expect(ids).toContain(two.id);

    await until(() => backgroundTasks.get(one.id)?.state !== "running");
    await until(() => backgroundTasks.get(two.id)?.state !== "running");
  });

  it("answers nothing for a name it does not know", () => {
    expect(backgroundTasks.get("bg_nonexistent")).toBeUndefined();
  });
});

describe("a command that could not start", () => {
  /**
   * It is announced once.
   *
   * A child that cannot be spawned reports an error and then a close, so an
   * unguarded handler fires twice. A caller using the notice to continue the turn
   * would continue it twice, and the second notice would arrive for a task that
   * had already been reported finished.
   */
  it("notifies once, not once per event", async () => {
    const registry = new TaskRegistry();
    const seen: string[] = [];
    registry.onEnded((task) => seen.push(task.id));

    // A working directory that does not exist makes the spawn itself fail, which
    // is the path that reports an error and then a close.
    const task = registry.start({ command: "echo hi", cwd: "/nonexistent-directory-for-a-test" });
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(seen).toEqual([task.id]);
    expect(registry.get(task.id)?.state).toBe("exited");
  });
});


describe("being told when a command ends", () => {
  /**
   * The subscription can be given back.
   *
   * The registry is a process singleton, so a listener that cannot be removed
   * outlives the surface that asked for it. A session that restarted its
   * subscriber would keep notifying the old one for the life of the process —
   * and the old one belongs to a conversation that is over.
   */
  it("stops notifying once the subscription is released", async () => {
    const registry = new TaskRegistry();
    const seen: string[] = [];
    const release = registry.onEnded((task) => seen.push(task.id));

    release();
    registry.start({ command: "echo done", cwd: process.cwd() });
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(seen).toEqual([]);
  });

  it("keeps notifying a listener that is still subscribed", async () => {
    const registry = new TaskRegistry();
    const seen: string[] = [];
    const release = registry.onEnded((task) => seen.push(task.id));
    registry.onEnded(() => undefined);

    registry.start({ command: "echo done", cwd: process.cwd() });
    await new Promise((resolve) => setTimeout(resolve, 400));
    release();

    expect(seen).toHaveLength(1);
  });
});

describe("output past the size limit", () => {
  /**
   * The reader is told that earlier output was dropped.
   *
   * The buffer keeps the tail, because a command that fails says why at the end.
   * What must not happen is a reader being handed a clipped tail with nothing to
   * say it was clipped: a report whose beginning is missing reads as the whole
   * story, and the missing part is exactly where the command said what it was
   * doing.
   */
  it("says so rather than looking like the whole output", async () => {
    const registry = new TaskRegistry();
    // Comfortably past the buffer, so something is definitely dropped.
    const task = registry.start({
      command: "for i in $(seq 1 20000); do echo line-$i-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx; done",
      cwd: process.cwd(),
    });
    await new Promise((resolve) => setTimeout(resolve, 2_500));

    const finished = registry.get(task.id)!;
    expect(finished.outputTruncated).toBe(true);
    expect(renderTask(finished)).toMatch(/earlier output was dropped/);
  }, 20_000);

  it("does not claim a drop when there was none", () => {
    const task = registry_spy();
    expect(task.outputTruncated).not.toBe(true);
    expect(renderTask(task)).not.toMatch(/earlier output was dropped/);
  });
});

/** A finished task with a small output, built directly. */
function registry_spy() {
  return {
    id: "bg_1",
    command: "echo hi",
    cwd: process.cwd(),
    pid: undefined,
    startedAt: Date.now(),
    state: "exited" as const,
    exitCode: 0,
    output: "hi\n",
  };
}
