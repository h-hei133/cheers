import { describe, expect, it } from "vitest";
import { runLoopCommand } from "./loopCommandRuntime.js";

const CONTEXT = { cwd: process.cwd() };

describe("aiming a repair loop at a gate", () => {
  it("costs no turn when the gate already passes", async () => {
    const result = await runLoopCommand(["exit 0"], CONTEXT);

    expect(result.kind).toBe("local");
    if (result.kind === "local") {
      expect(result.output).toContain("already passes");
      expect(result.output).toContain("does not need a turn");
    }
  });

  it("carries the failure it observed into the prompt, not a description of it", async () => {
    const result = await runLoopCommand(["echo 'AssertionError: expected 3 got 4' 1>&2; exit 1"], CONTEXT);

    expect(result.kind).toBe("prompt");
    if (result.kind === "prompt") {
      expect(result.prompt).toContain("AssertionError: expected 3 got 4");
      expect(result.prompt).toContain("It exited 1");
    }
  });

  it("requires the gate to be re-run through a tool before it is called fixed", async () => {
    const result = await runLoopCommand(["exit 2"], CONTEXT);

    expect(result.kind).toBe("prompt");
    if (result.kind === "prompt") {
      expect(result.prompt).toMatch(/run `exit 2` with the bash tool/i);
      expect(result.prompt).toMatch(/never report the gate as passing without having run it/i);
    }
  });

  it("takes a leading number as the attempt budget and caps it", async () => {
    const asked = await runLoopCommand(["3", "exit 1"], CONTEXT);
    const capped = await runLoopCommand(["99", "exit 1"], CONTEXT);

    if (asked.kind === "prompt") expect(asked.prompt).toContain("at most 3 attempts");
    if (capped.kind === "prompt") expect(capped.prompt).toContain("at most 10 attempts");
  });

  it("treats a bare command as the gate, with the default budget", async () => {
    const result = await runLoopCommand(["exit", "1"], CONTEXT);

    expect(result.kind).toBe("prompt");
    if (result.kind === "prompt") {
      expect(result.prompt).toContain("The gate is `exit 1`");
      expect(result.prompt).toContain("at most 5 attempts");
    }
  });

  it("says the turn budget may end the run before the attempts do", async () => {
    const result = await runLoopCommand(["exit 1"], CONTEXT);

    // The attempt count is what the model is asked for; the turn budget is what
    // actually stops it. Presenting only the first would overstate the guarantee.
    if (result.kind === "prompt") expect(result.prompt).toMatch(/turn budget is spent/i);
  });

  it("names the escape conditions rather than encouraging persistence", async () => {
    const result = await runLoopCommand(["exit 1"], CONTEXT);

    if (result.kind === "prompt") {
      expect(result.prompt).toMatch(/same failure comes back unchanged/i);
      expect(result.prompt).toMatch(/changing what the gate checks rather than what it checks/i);
    }
  });

  it("summarises the gate in a line rather than echoing the failure twice", async () => {
    const result = await runLoopCommand(["2", "node -e \"console.error('SPRAWLING STACK TRACE'); process.exit(7)\""], CONTEXT);

    expect(result.kind).toBe("prompt");
    if (result.kind === "prompt") {
      expect(result.notice).toContain("exited 7");
      expect(result.notice).toContain("at most 2 attempts");
      // The prompt carries the failure; the notice names the gate and stops, so the
      // transcript does not show the same output twice above the repair.
      expect(result.prompt).toContain("SPRAWLING STACK TRACE");
      expect(result.notice!.split("\n")).toHaveLength(1);
    }
  });

  it("explains itself when given no gate", async () => {
    const result = await runLoopCommand([], CONTEXT);

    expect(result.kind).toBe("local");
    if (result.kind === "local") expect(result.output).toContain("/loop <attempts> <command>");
  });
});
