import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildProjectCliProcessSpec, runAgentCliProcess } from "../../test-utils/cli/process.js";
import { reportText } from '../../core/commands/report/projection.js';

let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(process.cwd(), ".tmp-print-commands-"));
  await fs.mkdir(path.join(root, "workspace"));
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("scripted session commands", () => {
  it.each([[false, false], [true, false], [false, true]])("emits JSON reports across commands and turns (turn=%s, print=%s)", async (includeTurn, printMode) => {
    const spec = buildProjectCliProcessSpec({
      prompt: "", projectPath: path.join(root, "workspace"), homeDir: path.join(root, "home"),
      args: ["--json", "--offline"],
      env: { CHEERS_PROVIDER_MODE: "synthetic", CHEERS_TEST_ROOT: root, FORCE_COLOR: '3' }, timeoutMs: 20_000,
    });
    const result = await runAgentCliProcess({
      ...spec, args: spec.args.filter((arg) => arg !== "" && (printMode || arg !== "--print")),
      stdin: `/tools read\n${includeTurn ? "Hello\n" : ""}/context\n/cost\n/hotkey\n/diagnose\n/metrics 2\n/sidebar snapshot\n/help\n/todo list\n/exit\n`,
    });
    expect(result.timedOut).toBe(false);
    expect(result.exitCode, result.output.combined).toBe(0);
    const lines = result.output.stdout.trim().split("\n").map((line) => JSON.parse(line));
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.map((line) => line.order)).toEqual(lines.map((_, index) => index + 1));
    expect(lines.every((line) => line.schemaVersion === "run-event-stream.v1")).toBe(true);
    const output = lines.filter((line) => line.eventType === "cli.output").map((line) => line.facts.text).join("");
    expect(output).toContain("No tasks currently");
    const reports = lines.filter(line => line.eventType === 'cli.output' && line.facts.report);
    expect(reports.map(line => line.facts.report.title)).toEqual([
      'read', 'Context window', 'Usage', 'Keyboard and mouse', 'Repository diagnosis', 'Metrics', 'Visible agent state snapshot',
    ]);
    for (const line of reports) {
      expect(line.facts.report.version).toBe(1);
      expect(line.facts.text).toBe(`${reportText(line.facts.report)}\n`);
      expect(line.truthfulness).toEqual({ observationOnly: true, terminalSuccessClaim: false });
    }
    expect(reports[0].facts.report.facts.permission).toBe('not-evaluated');
    expect(JSON.stringify(lines)).not.toMatch(/\\u001b|\x1b/i);
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
