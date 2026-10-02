import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildProjectCliProcessSpec, runAgentCliProcess } from "../../test-utils/cli/process.js";

let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(process.cwd(), ".tmp-print-commands-"));
  await fs.mkdir(path.join(root, "workspace"));
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("scripted session commands", () => {
  it.each([false, true])("emits only JSON, including commands after a model turn (turn=%s)", async (includeTurn) => {
    const spec = buildProjectCliProcessSpec({
      prompt: "", projectPath: path.join(root, "workspace"), homeDir: path.join(root, "home"),
      args: ["--json", "--offline"],
      env: { CHEERS_PROVIDER_MODE: "synthetic", CHEERS_TEST_ROOT: root }, timeoutMs: 20_000,
    });
    const result = await runAgentCliProcess({
      ...spec, args: spec.args.filter((arg) => arg !== "" && arg !== "--print"),
      stdin: `${includeTurn ? "Hello\n" : ""}/help\n/todo list\n/exit\n`,
    });
    expect(result.timedOut).toBe(false);
    expect(result.exitCode, result.output.combined).toBe(0);
    const lines = result.output.stdout.trim().split("\n").map((line) => JSON.parse(line));
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.map((line) => line.order)).toEqual(lines.map((_, index) => index + 1));
    expect(lines.every((line) => line.schemaVersion === "run-event-stream.v1")).toBe(true);
    const output = lines.filter((line) => line.eventType === "cli.output").map((line) => line.facts.text).join("");
    expect(output).toContain("No tasks currently");
    if (includeTurn) {
      expect(lines.some((line) => line.eventType === "query.started")).toBe(true);
      expect(lines.some((line) => line.eventType === "query.completed")).toBe(true);
    }
  }, 25_000);

  it.each([true, false])("starts a fresh session and stops queued input (print=%s)", async (printMode) => {
    const spec = buildProjectCliProcessSpec({
      prompt: "", projectPath: path.join(root, "workspace"), homeDir: path.join(root, "home"),
      env: { CHEERS_PROVIDER_MODE: "synthetic", CHEERS_TEST_ROOT: root }, timeoutMs: 15_000,
    });
    const result = await runAgentCliProcess({
      ...spec,
      args: spec.args.filter((arg) => arg !== "" && (printMode || arg !== "--print")),
      stdin: "/todo add before-clear\n/clear\n/todo list\n/exit\n/todo add must-not-run\n",
    });
    expect(result.timedOut).toBe(false);
    expect(result.exitCode, result.output.combined).toBe(0);
    expect(result.output.stdout).toContain("Started a new session:");
    expect(result.output.stdout).toContain("No tasks currently");
    expect(result.output.stdout).not.toContain("must-not-run");
    expect(result.output.stdout).not.toContain("interactive-only");
  }, 20_000);
});
