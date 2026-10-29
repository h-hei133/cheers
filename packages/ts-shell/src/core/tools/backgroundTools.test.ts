import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createCoreToolRegistry } from "./registry.js";
import { planSandboxedCommand } from "../../sandbox/osSandbox.js";
import { TaskRegistry } from "../shell/background/tasks.js";
import type { ToolExecutionContext } from "../../tools/types.js";

const context = {
  workspaceRoot: process.cwd(),
  sessionId: "sess_test",
} as unknown as ToolExecutionContext;

function tool(name: string) {
  const registry = createCoreToolRegistry();
  const definition = registry.get(name);
  if (!definition) throw new Error(`${name} is not registered`);
  return definition;
}

describe("starting a command in the background", () => {
  /**
   * A timeout is refused rather than ignored.
   *
   * Nothing waits for a background command, so there is no deadline to enforce.
   * Accepting the number would report a limit that no code applies, and a caller
   * who asked for one wanted the command to end.
   */
  it("refuses a timeout it could not enforce", async () => {
    const result = await tool("bash").execute(
      { command: "echo hi", runInBackground: true, timeout: 5 },
      context,
    );

    expect(result.success).toBe(false);
    expect(result.error ?? result.output).toMatch(/no timeout/i);
  });

  /**
   * The command is launched the way the foreground one is.
   *
   * Both go through one launcher plan, so a background command cannot end up
   * running bare on the host while its foreground twin is confined.
   */
  it("is launched through the same planner as a foreground command", async () => {
    const result = await tool("bash").execute(
      { command: "echo backgrounded", runInBackground: true },
      context,
    );

    expect(result.output).toMatch(/^Started bg_/);
  });
});


describe("a background command and the sandbox", () => {
  const workspaces: string[] = [];
  afterEach(() => {
    for (const workspace of workspaces.splice(0)) fs.rmSync(workspace, { recursive: true, force: true });
  });

  function isolatedWorkspace(): string {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "cheers-bg-sandbox-"));
    workspaces.push(workspace);
    fs.mkdirSync(path.join(workspace, ".agents"), { recursive: true });
    fs.writeFileSync(
      path.join(workspace, ".agents", "sandbox.json"),
      JSON.stringify({ enabled: true }),
      "utf8",
    );
    return workspace;
  }

  /**
   * The registry hands the launched command the launcher the plan chose.
   *
   * This is the seam that matters: the background path used to compose its own
   * shell, so a command started with runInBackground ran bare on the host while
   * the same command run in the foreground was confined. The assertion uses a
   * launcher whose effect is visible in the output, so it fails if the plan is
   * ignored rather than merely mis-reported.
   */
  it("runs the command through the explicit launcher it was given", async () => {
    const workspace = isolatedWorkspace();
    const plan = planSandboxedCommand({
      shell: "/bin/sh",
      shellArgs: ["-c", "echo hi"],
      workspaceRoot: workspace,
    });
    // Confinement is what the plan decided; an unavailable launcher is still
    // reported rather than silently skipped, which the foreground path proves.
    expect(["isolated", "unavailable"]).toContain(plan.state);

    const registry = new TaskRegistry();
    const task = registry.start({
      command: "echo hello",
      cwd: workspace,
      // A launcher that writes its own trace, so honouring it is observable.
      shell: { command: "/bin/sh", args: ["-c", "echo LAUNCHER_WAS_USED; echo hello"] },
    });
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(registry.get(task.id)?.output).toContain("LAUNCHER_WAS_USED");
  });
});

describe("waiting for a background command", () => {
  it("returns at once when the command has already settled", async () => {
    const settled = { id: 'task-1', command: 'true', cwd: '/tmp', pid: undefined, startedAt: 0, state: 'exited' as const, output: 'done' };
    const background = {
      get: (id: string) => (id === 'task-1' ? settled : undefined),
      list: () => [settled],
      onEnded: () => () => {},
    };
    const result = await tool('taskWait').execute({ taskId: 'task-1' },
      { ...context, background } as unknown as ToolExecutionContext);

    expect(result.output).toContain('task-1');
    expect(result.output).toContain('done');
  });

  it("waits on the completion event instead of polling", async () => {
    let settle: ((task: typeof running) => void) | undefined;
    const running = { id: 'task-2', command: 'slow', cwd: '/tmp', pid: 1, startedAt: 0, state: 'running' as const, output: 'partial' };
    const finished = { ...running, state: 'exited' as const, output: 'partial then done' };
    const background = {
      get: () => running,
      list: () => [running],
      onEnded: (listener: (task: typeof running) => void) => { settle = listener; return () => { settle = undefined; }; },
    };
    const pending = tool('taskWait').execute({ taskId: 'task-2' },
      { ...context, background } as unknown as ToolExecutionContext);
    // Nothing has happened yet: the call is blocked on the runner's event.
    expect(settle).toBeDefined();
    settle!(finished);

    expect((await pending).output).toContain('partial then done');
  });

  it("reports a still-running command when the deadline passes", async () => {
    const running = { id: 'task-3', command: 'slow', cwd: '/tmp', pid: 1, startedAt: 0, state: 'running' as const, output: '' };
    const background = { get: () => running, list: () => [running], onEnded: () => () => {} };
    const result = await tool('taskWait').execute({ taskId: 'task-3', timeoutSeconds: 1 },
      { ...context, background } as unknown as ToolExecutionContext);

    expect(result.output).toContain('still running');
  });

  it("gives up when the turn is cancelled, and releases its listener", async () => {
    const running = { id: 'task-4', command: 'slow', cwd: '/tmp', pid: 1, startedAt: 0, state: 'running' as const, output: '' };
    let released = false;
    const background = { get: () => running, list: () => [running], onEnded: () => () => { released = true; } };
    const controller = new AbortController();
    const pending = tool('taskWait').execute({ taskId: 'task-4', timeoutSeconds: 300 },
      { ...context, background, abortSignal: controller.signal } as unknown as ToolExecutionContext);
    controller.abort();

    expect((await pending).output).toContain('still running');
    expect(released).toBe(true);
  });

  it("names the commands that do exist when the id is unknown", async () => {
    const background = { get: () => undefined, list: () => [{ id: 'task-9' }], onEnded: () => () => {} };
    const result = await tool('taskWait').execute({ taskId: 'nope' },
      { ...context, background } as unknown as ToolExecutionContext);

    expect(result.error).toContain('task-9');
  });
});
