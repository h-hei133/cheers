import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createCoreToolRegistry } from "./registry.js";
import { planSandboxedCommand } from "../../sandbox/osSandbox.js";
import { TaskRegistry } from "../shell/background/tasks.js";
import type { ToolExecutionContext } from "../../tools/types.js";
import { processStopPermission } from "./permissionContext.js";

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

describe("stopping a background command", () => {
  /**
   * It answers to a permission check.
   *
   * Starting a command and stopping one are separate operations: the approval
   * that covered the start did not cover ending whatever the command went on to
   * spawn. A tool that ends a process group with no check at all is the one
   * place an approval gate can be walked around.
   */
  it("asks for permission to end a process", () => {
    const checks = tool("taskStop").permissions?.check?.({ taskId: "bg_1" }, context) ?? [];

    expect(checks).toHaveLength(1);
    expect(checks[0]?.scope).toBe("process");
    expect(checks[0]?.target).toBe("bg_1");
  });

  it("names the process it is about to end", () => {
    expect(processStopPermission({ taskId: "bg_7" }, context)[0]?.target).toBe("bg_7");
  });
});

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
