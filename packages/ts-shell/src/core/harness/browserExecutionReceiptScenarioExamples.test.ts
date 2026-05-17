import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { agentCliAssertionFailures } from "./agentCliScenarioAssertions.js";
import { renderAgentCliScenarioReport } from "./agentCliScenarioReport.js";
import { runAgentCliScenario } from "./agentCliScenarioRunner.js";
import { createBrowserExternalRunnerScenarioFixture } from "./browserExternalRunnerScenarioFixtures.js";
import type { AgentCliScenario } from "./agentCliScenarioModel.js";

describe("browser execution receipt CLI scenario examples", () => {
  const tempRoots: string[] = [];
  const cleanupFns: (() => void)[] = [];

  afterEach(() => {
    for (const cleanup of cleanupFns.splice(0)) {
      cleanup();
    }
    for (const root of tempRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("external runner observe success produces replay-ready receipt", async () => {
    const fixture = createBrowserExternalRunnerScenarioFixture();
    cleanupFns.push(fixture.cleanup);
    const result = await runAgentCliScenario({
      scenario: scenario("route104-observe-receipt", [
        {
          id: "observe",
          kind: "cli-command",
          prompt: "/browser execute observe local-fixture://route103-demo",
          env: fixture.env,
          assertions: receiptAssertions("executed", "yes", "replay-ready"),
        },
      ]),
      projectPath: projectRoot(),
      homeDir: tempRoot("private-agents-route104-home-"),
    });

    expect(agentCliAssertionFailures(result)).toEqual([]);
    expect(renderAgentCliScenarioReport(result)).toContain("receipt=executed");
    expect(renderAgentCliScenarioReport(result)).toContain("replay=replay-ready");
  });

  it("external runner extract success produces replay-ready receipt", async () => {
    const fixture = createBrowserExternalRunnerScenarioFixture();
    cleanupFns.push(fixture.cleanup);
    const result = await runAgentCliScenario({
      scenario: scenario("route104-extract-receipt", [
        {
          id: "extract",
          kind: "cli-command",
          prompt: "/browser execute extract route103 summary",
          env: fixture.env,
          assertions: [
            ...receiptAssertions("executed", "yes", "replay-ready"),
            { id: "extract-summary", kind: "stdout-contains", text: "Safe extracted Route 103 fixture summary." },
          ],
        },
      ]),
      projectPath: projectRoot(),
      homeDir: tempRoot("private-agents-route104-home-"),
    });

    expect(agentCliAssertionFailures(result)).toEqual([]);
  });

  it("external URL blocked produces replay-blocked receipt", async () => {
    const fixture = createBrowserExternalRunnerScenarioFixture();
    cleanupFns.push(fixture.cleanup);
    const result = await runAgentCliScenario({
      scenario: scenario("route104-external-url-receipt", [
        {
          id: "navigate",
          kind: "cli-command",
          prompt: "/browser execute navigate https://example.com",
          env: fixture.env,
          assertions: [
            ...receiptAssertions("blocked", "no", "replay-blocked"),
            { id: "blocked", kind: "browser-execution-blocked" },
          ],
        },
      ]),
      projectPath: projectRoot(),
      homeDir: tempRoot("private-agents-route104-home-"),
    });

    expect(agentCliAssertionFailures(result)).toEqual([]);
  });

  it("malformed response produces invalid-response receipt without raw stdout leak", async () => {
    const result = await runReceiptFailureScenario("malformed", "invalid-response", "replay-blocked");

    expect(agentCliAssertionFailures(result)).toEqual([]);
  });

  it("timeout produces timed-out receipt without hanging", async () => {
    const result = await runReceiptFailureScenario("timeout", "timed-out", "replay-blocked");

    expect(agentCliAssertionFailures(result)).toEqual([]);
  });

  it("unsafe output produces unsafe blocked receipt without raw leaks", async () => {
    const result = await runReceiptFailureScenario("unsafe-output", "unsafe-output", "replay-blocked");

    expect(agentCliAssertionFailures(result)).toEqual([]);
  });

  async function runReceiptFailureScenario(
    kind: "malformed" | "timeout" | "unsafe-output",
    receiptStatus: string,
    replayStatus: string,
  ) {
    const fixture = createBrowserExternalRunnerScenarioFixture({ kind });
    cleanupFns.push(fixture.cleanup);
    return runAgentCliScenario({
      scenario: scenario(`route104-${kind}-receipt`, [
        {
          id: "observe",
          kind: "cli-command",
          prompt: "/browser execute observe local-fixture://route103-demo",
          env: fixture.env,
          assertions: receiptAssertions(receiptStatus, "no", replayStatus),
        },
      ]),
      projectPath: projectRoot(),
      homeDir: tempRoot("private-agents-route104-home-"),
    });
  }

  function receiptAssertions(status: string, executed: string, replay: string): AgentCliScenario["steps"][number]["assertions"] {
    return [
      { id: "receipt-exists", kind: "browser-receipt-exists" },
      { id: "receipt-status", kind: "browser-receipt-status", text: status },
      { id: "receipt-executed", kind: "browser-receipt-executed", text: executed },
      { id: "receipt-replay", kind: "browser-receipt-replay-readiness", text: replay },
      { id: "receipt-safe", kind: "browser-receipt-safe" },
      { id: "receipt-decisions", kind: "browser-receipt-decisions" },
      { id: "receipt-next", kind: "browser-receipt-next-action" },
      { id: "no-raw", kind: "no-raw-content-or-secrets" },
    ];
  }

  function scenario(id: string, steps: AgentCliScenario["steps"]): AgentCliScenario {
    return {
      id,
      name: id,
      metadata: { route: "104", capability: ["browser", "receipt", "replay-readiness"] },
      steps,
      expectedOutcome: { status: "passed" },
    };
  }

  function tempRoot(prefix: string): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempRoots.push(root);
    return root;
  }

  function projectRoot(): string {
    const projectPath = tempRoot("private-agents-route104-project-");
    fs.writeFileSync(path.join(projectPath, "README.md"), "Route 104 fixture\n", "utf8");
    return projectPath;
  }
});
