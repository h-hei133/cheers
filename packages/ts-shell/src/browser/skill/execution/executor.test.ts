import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseBrowserPreviewActionArgs } from "../../browserActionContract.js";
import { createBrowserExecutionRequest } from "../../browserExecutionContract.js";
import { createBrowserLocalExecutionAuthority } from "../../browserLocalExecutionAuthority.js";
import { createBrowserLocalFixture } from "../../browserLocalFixture.js";
import { createBrowserSkillRunnerMetadata } from "../runner/metadata.js";
import { createBrowserSkillRunnerBinding } from "../runner/binding.js";
import { BrowserSkillExecutionExecutor } from "./executor.js";
import { createBrowserExecutionResult } from "../../browserExecutionResult.js";
import { decideBrowserExecutionPolicy } from "../../browserExecutionPolicy.js";

describe("browser skill execution executor", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns executed receipt evidence for safe skill response", async () => {
    const executor = skillExecutor("success");
    const request = browserRequest(["observe", "local-fixture://route106-demo"]);
    const executorResult = await executor.execute(request);
    const result = createBrowserExecutionResult({
      request: { ...request, mode: "skill-managed" },
      policy: decideBrowserExecutionPolicy({ request: { ...request, mode: "skill-managed" }, executorAvailable: true }),
      executorResult,
      skillRunnerMetadata: executor.metadata,
    });

    expect(executorResult.executed).toBe(true);
    expect(executorResult.executorKind).toBe("skill-runner");
    expect(result.receipt.source).toBe("skill-managed");
    expect(result.receipt.replayReadiness.status).toBe("replay-ready");
  });

  it("blocks malformed, timeout, and unsafe output", async () => {
    for (const kind of ["malformed", "timeout", "unsafe-output"] as const) {
      const executor = skillExecutor(kind);
      const result = await executor.execute(browserRequest(["observe", "local-fixture://route106-demo"]));

      expect(result.executed).toBe(false);
      expect(result.status).toBe("blocked");
      expect(JSON.stringify(result)).not.toContain("RAW_");
      expect(JSON.stringify(result)).not.toContain("sk-testsecret");
    }
  });

  function skillExecutor(kind: "success" | "malformed" | "timeout" | "unsafe-output") {
    const metadata = createBrowserSkillRunnerMetadata({
      runnerId: "skill:route106-browser-runner",
      skillId: "skill:route106-browser-runner",
      actions: ["observe", "extract", "navigate-local"],
    });
    const fixture = createBrowserLocalFixture({
      fixtureId: "fixture:route106-demo",
      url: "local-fixture://route106-demo",
      text: "Safe Route 106 fixture.",
      allowedActions: ["observe", "extract", "navigate-local"],
    });
    const runnerPath = writeRunner(kind);
    return new BrowserSkillExecutionExecutor({
      metadata,
      binding: createBrowserSkillRunnerBinding({
        metadata,
        runnerCommand: {
          command: process.execPath,
          args: [runnerPath],
        },
        timeoutMs: kind === "timeout" ? 120 : 1500,
      }),
      fixture,
      authority: createBrowserLocalExecutionAuthority({
        mode: "local-fixture",
        allowedFixtureIds: [fixture.fixtureId],
      }),
    });
  }

  function writeRunner(kind: "success" | "malformed" | "timeout" | "unsafe-output"): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "private-agents-skill-exec-test-"));
    roots.push(root);
    const runnerPath = path.join(root, "skill-runner.cjs");
    fs.writeFileSync(runnerPath, runnerScript(kind), "utf8");
    return runnerPath;
  }

  function browserRequest(args: readonly string[]) {
    const parsed = parseBrowserPreviewActionArgs(args);
    expect(parsed.ok).toBe(true);
    return createBrowserExecutionRequest({ action: parsed.contract! });
  }
});

function runnerScript(kind: "success" | "malformed" | "timeout" | "unsafe-output"): string {
  if (kind === "malformed") {
    return "process.stdin.resume(); process.stdin.on('end', () => process.stdout.write('not json RAW_SKILL_PAYLOAD'));\n";
  }
  if (kind === "timeout") {
    return "process.stdin.resume(); setTimeout(() => process.stdout.write('{}'), 5000);\n";
  }
  if (kind === "unsafe-output") {
    return [
      "process.stdin.resume();",
      "process.stdin.on('end', () => process.stdout.write(JSON.stringify({",
      "status: 'executed', executed: true, mode: 'skill-managed-test-local',",
      "evidence: { safeObservationSummary: '<html>sk-testsecret123</html>' },",
      "warnings: [], redactions: [], rawContent: 'excluded', providerCall: 'none', modelCall: 'none', browserSessionPersistence: 'none'",
      "})));",
    ].join("\n");
  }
  return [
    "let input = '';",
    "process.stdin.on('data', chunk => { input += chunk; });",
    "process.stdin.on('end', () => {",
    "  const request = JSON.parse(input);",
    "  process.stdout.write(JSON.stringify({",
    "    status: 'executed', executed: true, mode: 'skill-managed-test-local',",
    "    evidence: {",
    "      safeTitle: 'Route 106 skill fixture',",
    "      safeUrl: request.safeUrl,",
    "      safeObservationSummary: request.action === 'extract' ? undefined : 'Safe skill observed Route 106 fixture summary.',",
    "      safeExtractionSummary: request.action === 'extract' ? 'Safe skill extracted Route 106 fixture summary.' : undefined,",
    "      actionTraceSummary: `skill:${request.action};fixture:${request.fixtureId}`",
    "    },",
    "    warnings: [], redactions: [], rawContent: 'excluded', providerCall: 'none', modelCall: 'none', browserSessionPersistence: 'none'",
    "  }));",
    "});",
  ].join("\n");
}
