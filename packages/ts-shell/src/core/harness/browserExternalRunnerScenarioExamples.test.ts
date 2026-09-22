import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { agentCliAssertionFailures } from "./agentCliScenarioAssertions.js";
import { renderAgentCliScenarioReport } from "./agentCliScenarioReport.js";
import { runAgentCliScenario } from "./agentCliScenarioRunner.js";
import { createBrowserExternalRunnerScenarioFixture } from "./browserExternalRunnerScenarioFixtures.js";
import type { AgentCliScenario } from "./agentCliScenarioModel.js";

describe("browser external runner CLI scenario examples", () => {
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

  it("keeps default no-manifest browser execute blocked", async () => {
    const result = await runAgentCliScenario({
      scenario: scenario("route103-default-blocked", [
        {
          id: "observe",
          kind: "cli-command",
          prompt: "/browser execute observe local-fixture://route103-demo",
          assertions: [
            { id: "blocked", kind: "browser-execution-blocked" },
            { id: "executed-no", kind: "executed-no" },
            { id: "missing", kind: "stdout-contains", text: "Manifest status: missing" },
          ],
        },
      ]),
      projectPath: projectRoot(),
      homeDir: tempRoot("cheers-route103-home-"),
    });

    expect(agentCliAssertionFailures(result)).toEqual([]);
  });

  it("runs observe and extract through explicit test-local external runner manifest", async () => {
    const fixture = createBrowserExternalRunnerScenarioFixture();
    cleanupFns.push(fixture.cleanup);
    const result = await runAgentCliScenario({
      scenario: scenario("route103-external-runner-success", [
        {
          id: "observe",
          kind: "cli-command",
          prompt: "/browser execute observe local-fixture://route103-demo",
          env: fixture.env,
          assertions: [
            { id: "executed", kind: "executed-yes" },
            { id: "mode", kind: "stdout-contains", text: "Mode: test-local" },
            { id: "runner", kind: "stdout-contains", text: "External browser runner" },
            { id: "safe", kind: "stdout-contains", text: "Safe observed Route 103 fixture summary." },
          ],
        },
        {
          id: "extract",
          kind: "cli-command",
          prompt: "/browser execute extract route103 summary",
          env: fixture.env,
          assertions: [
            { id: "executed", kind: "executed-yes" },
            { id: "extract", kind: "stdout-contains", text: "Safe extracted Route 103 fixture summary." },
            { id: "no-raw", kind: "no-raw-content-or-secrets" },
          ],
        },
      ]),
      projectPath: projectRoot(),
      homeDir: tempRoot("cheers-route103-home-"),
    });

    expect(agentCliAssertionFailures(result)).toEqual([]);
    expect(renderAgentCliScenarioReport(result)).toContain("mode=external-runner");
  }, 20000);

  it("blocks external URL navigation even with an external runner manifest", async () => {
    const fixture = createBrowserExternalRunnerScenarioFixture();
    cleanupFns.push(fixture.cleanup);
    const result = await runAgentCliScenario({
      scenario: scenario("route103-external-url-blocked", [
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
      homeDir: tempRoot("cheers-route103-home-"),
    });

    expect(agentCliAssertionFailures(result)).toEqual([]);
  });

  it("blocks invalid external runner manifests without exposing raw manifest content", async () => {
    const fixture = createBrowserExternalRunnerScenarioFixture({
      unsafeManifest: {
        manifestVersion: "browser-external-runner-manifest/v1",
        source: "cli-harness",
        runnerMode: "test-local",
        runnerId: "bad",
        runnerCommand: {
          command: "playwright",
          args: ["mcp", "https://example.com", "sk-testsecret123"],
        },
        fixture: {
          id: "fixture:bad",
          kind: "static-page",
          title: "<main>raw</main>",
          url: "local-fixture://route103-demo",
          textSummary: "safe",
          allowedActions: ["observe"],
        },
        allowedActions: ["observe"],
        sandboxAuthority: "local-fixture",
        networkAllowlist: "none",
        confirmationState: "confirmed",
        timeoutMs: 1500,
        outputBudgetBytes: 4096,
        evidencePolicy: "safe-summary-only",
      },
    });
    cleanupFns.push(fixture.cleanup);
    const result = await runAgentCliScenario({
      scenario: scenario("route103-invalid-external-runner-manifest", [
        {
          id: "observe",
          kind: "cli-command",
          prompt: "/browser execute observe local-fixture://route103-demo",
          env: fixture.env,
          assertions: [
            { id: "blocked", kind: "browser-execution-blocked" },
            { id: "executed-no", kind: "executed-no" },
            { id: "invalid", kind: "stdout-contains", text: "Manifest status: invalid" },
            { id: "no-raw", kind: "no-raw-content-or-secrets" },
          ],
        },
      ]),
      projectPath: projectRoot(),
      homeDir: tempRoot("cheers-route103-home-"),
    });

    expect(agentCliAssertionFailures(result)).toEqual([]);
  });

  it("blocks malformed, timeout, and unsafe runner responses without raw leaks", async () => {
    for (const kind of ["malformed", "timeout", "unsafe-output"] as const) {
      const fixture = createBrowserExternalRunnerScenarioFixture({ kind });
      cleanupFns.push(fixture.cleanup);
      const expectedStatus = kind === "timeout" ? "timed-out" : "invalid-response";
      const result = await runAgentCliScenario({
        scenario: scenario(`route103-${kind}`, [
          {
            id: "observe",
            kind: "cli-command",
            prompt: "/browser execute observe local-fixture://route103-demo",
            env: fixture.env,
            assertions: [
              { id: "executed-no", kind: "executed-no" },
              { id: "status", kind: "stdout-contains", text: expectedStatus },
              { id: "no-raw", kind: "no-raw-content-or-secrets" },
            ],
          },
        ]),
        projectPath: projectRoot(),
        homeDir: tempRoot("cheers-route103-home-"),
      });
      expect(agentCliAssertionFailures(result)).toEqual([]);
    }
  }, 30000);

  function scenario(id: string, steps: AgentCliScenario["steps"]): AgentCliScenario {
    return {
      id,
      name: id,
      metadata: { route: "103", capability: ["browser", "external-runner", "real-cli"] },
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
    const projectPath = tempRoot("cheers-route103-project-");
    fs.writeFileSync(path.join(projectPath, "README.md"), "Route 103 fixture\n", "utf8");
    return projectPath;
  }
});
