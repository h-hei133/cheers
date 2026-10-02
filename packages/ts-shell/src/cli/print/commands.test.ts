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
