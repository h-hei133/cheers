import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { agentCliAssertionFailures } from "./agentCliScenarioAssertions.js";
import { renderAgentCliScenarioReport } from "./agentCliScenarioReport.js";
import { runAgentCliScenario } from "./agentCliScenarioRunner.js";
import type { AgentCliScenario } from "./agentCliScenarioModel.js";
import {
  createBrowserSkillExecutionScenarioFixture,
  type BrowserSkillExecutionScenarioFixture,
} from "./browserSkillExecutionScenarioFixtures.js";

describe("browser skill execution CLI scenario examples", () => {
  const tempRoots: string[] = [];
  const fixtures: BrowserSkillExecutionScenarioFixture[] = [];

  afterEach(() => {
    for (const fixture of fixtures.splice(0)) {
      fixture.cleanup();
    }
    for (const root of tempRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps default no-manifest browser execution blocked", async () => {
    const result = await runAgentCliScenario({
      scenario: scenario("route106-default-blocked", [
        {
          id: "observe",
          kind: "cli-command",
          prompt: "/browser execute observe local-fixture://route106-demo",
          assertions: [
            { id: "blocked", kind: "browser-execution-blocked" },
            { id: "executed-no", kind: "executed-no" },
            { id: "missing", kind: "stdout-contains", text: "Manifest status: missing" },
          ],
        },
      ]),
      projectPath: projectRoot(),
      homeDir: tempRoot("private-agents-route106-home-"),
    });

    expect(agentCliAssertionFailures(result)).toEqual([]);
  });

  it("keeps valid metadata without binding future-execution-required", async () => {
    const fixture = createBrowserSkillExecutionScenarioFixture({ kind: "missing-binding" });
    fixtures.push(fixture);
    const result = await runAgentCliScenario({
      scenario: scenario("route106-missing-binding", [
        {
          id: "observe",
          kind: "cli-command",
          prompt: "/browser execute observe local-fixture://route106-demo",
          env: fixture.env,
          assertions: [
            { id: "blocked", kind: "browser-execution-blocked" },
            { id: "future", kind: "stdout-contains", text: "future-execution-required" },
            { id: "executed-no", kind: "executed-no" },
            { id: "replay", kind: "stdout-contains", text: "Replay readiness: replay-needs-skill-runner" },
          ],
        },
      ]),
      projectPath: projectRoot(),
      homeDir: tempRoot("private-agents-route106-home-"),
    });

    expect(agentCliAssertionFailures(result)).toEqual([]);
  });

  it("runs observe and extract through explicit skill-managed test-local binding", async () => {
    const fixture = createBrowserSkillExecutionScenarioFixture();
    fixtures.push(fixture);
    const result = await runAgentCliScenario({
      scenario: scenario("route106-skill-runner-success", [
        {
          id: "observe",
          kind: "cli-command",
          prompt: "/browser execute observe local-fixture://route106-demo",
          env: fixture.env,
          assertions: [
            { id: "executed", kind: "executed-yes" },
            { id: "skill", kind: "stdout-contains", text: "Skill-managed browser execution" },
            { id: "source", kind: "stdout-contains", text: "Source: skill-managed" },
            { id: "replay", kind: "stdout-contains", text: "Replay readiness: replay-ready" },
          ],
        },
        {
          id: "extract",
          kind: "cli-command",
          prompt: "/browser execute extract route106 summary",
          env: fixture.env,
          assertions: [
            { id: "executed", kind: "executed-yes" },
            { id: "extract", kind: "stdout-contains", text: "Safe skill extracted Route 106 fixture summary." },
            { id: "no-raw", kind: "no-raw-content-or-secrets" },
          ],
        },
      ]),
      projectPath: projectRoot(),
      homeDir: tempRoot("private-agents-route106-home-"),
    });

    expect(agentCliAssertionFailures(result)).toEqual([]);
    expect(renderAgentCliScenarioReport(result)).toContain("binding=test-local-process");
  }, 20000);

  it("blocks external URLs even with a valid skill binding", async () => {
    const fixture = createBrowserSkillExecutionScenarioFixture();
    fixtures.push(fixture);
    const result = await runAgentCliScenario({
      scenario: scenario("route106-external-url-blocked", [
        {
          id: "navigate",
          kind: "cli-command",
          prompt: "/browser execute navigate https://example.com",
          env: fixture.env,
          assertions: [
            { id: "blocked", kind: "browser-execution-blocked" },
            { id: "executed-no", kind: "executed-no" },
            { id: "network", kind: "stdout-contains", text: "No browser network allowlist was provided." },
          ],
        },
      ]),
      projectPath: projectRoot(),
      homeDir: tempRoot("private-agents-route106-home-"),
    });

    expect(agentCliAssertionFailures(result)).toEqual([]);
  });

  it("blocks unsafe capability, malformed, timeout, and unsafe skill output", async () => {
    for (const kind of ["unsafe-capability", "malformed", "timeout", "unsafe-output"] as const) {
      const fixture = createBrowserSkillExecutionScenarioFixture({ kind });
      fixtures.push(fixture);
      const result = await runAgentCliScenario({
        scenario: scenario(`route106-${kind}`, [
          {
            id: "observe",
            kind: "cli-command",
            prompt: "/browser execute observe local-fixture://route106-demo",
            env: fixture.env,
            assertions: [
              { id: "executed-no", kind: "executed-no" },
              { id: "no-raw", kind: "no-raw-content-or-secrets" },
              {
                id: "status",
                kind: "stdout-contains",
                text: kind === "unsafe-capability"
                  ? "Manifest status: invalid"
                  : kind === "malformed"
                    ? "invalid-response"
                    : kind === "timeout"
                      ? "timed-out"
                      : "unsafe-output",
              },
            ],
          },
        ]),
        projectPath: projectRoot(),
        homeDir: tempRoot("private-agents-route106-home-"),
      });
      expect(agentCliAssertionFailures(result)).toEqual([]);
    }
  }, 30000);

  function scenario(id: string, steps: AgentCliScenario["steps"]): AgentCliScenario {
    return {
      id,
      name: id,
      metadata: { route: "106", capability: ["browser", "skill-execution", "real-cli"] },
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
    const projectPath = tempRoot("private-agents-route106-project-");
    fs.writeFileSync(path.join(projectPath, "README.md"), "Route 106 fixture\n", "utf8");
    return projectPath;
  }
});
