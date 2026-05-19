import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { agentCliAssertionFailures } from "./agentCliScenarioAssertions.js";
import { runAgentCliScenario } from "./agentCliScenarioRunner.js";
import { renderAgentCliScenarioReport } from "./agentCliScenarioReport.js";
import { createBrowserCliLocalFixtureManifestFixture } from "./browserCliScenarioFixtures.js";
import type { AgentCliScenario } from "./agentCliScenarioModel.js";

describe("browser Playwright local real CLI scenario examples", () => {
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

  function tempRoot(prefix: string): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempRoots.push(root);
    return root;
  }

  function projectRoot(): string {
    const projectPath = tempRoot("private-agents-cli-route101-project-");
    fs.writeFileSync(path.join(projectPath, "README.md"), "Route 101 fixture\n", "utf8");
    return projectPath;
  }

  it("keeps default browser execution blocked without a manifest", async () => {
    const scenario: AgentCliScenario = {
      id: "cli-browser-playwright-default-blocked",
      name: "default playwright local browser execution blocked",
      metadata: { route: "101", capability: ["browser", "real-cli", "blocked"] },
      steps: [
        {
          id: "execute",
          kind: "cli-command",
          prompt: "/browser execute observe local-fixture://route101-demo",
          assertions: [
            { id: "blocked", kind: "browser-execution-blocked" },
            { id: "executed-no", kind: "executed-no" },
            { id: "manifest-missing", kind: "stdout-contains", text: "Manifest status: missing" },
            { id: "no-browser-process", kind: "stdout-contains", text: "Browser process: not launched" },
          ],
        },
      ],
      expectedOutcome: { status: "passed" },
    };

    const result = await runAgentCliScenario({
      scenario,
      projectPath: projectRoot(),
      homeDir: tempRoot("private-agents-cli-route101-home-"),
    });

    expect(agentCliAssertionFailures(result)).toEqual([]);
    expect(result.status).toBe("passed");
  });

  it("shows runtime dependency policy through /browser status", async () => {
    const scenario: AgentCliScenario = {
      id: "cli-browser-runtime-dependency-status",
      name: "browser status includes runtime dependency decision",
      metadata: { route: "102", capability: ["browser", "real-cli", "runtime-dependency-status"] },
      steps: [
        {
          id: "status",
          kind: "cli-command",
          prompt: "/browser status",
          assertions: [
            { id: "status-section", kind: "stdout-contains", text: "Browser runtime dependency" },
            { id: "decision", kind: "stdout-contains", text: "Decision: external-runner-only" },
            { id: "default-disabled", kind: "stdout-contains", text: "Browser execution default: disabled" },
            { id: "executed-no", kind: "executed-no" },
          ],
        },
      ],
      expectedOutcome: { status: "passed" },
    };

    const result = await runAgentCliScenario({
      scenario,
      projectPath: projectRoot(),
      homeDir: tempRoot("private-agents-cli-route102-home-"),
    });

    expect(agentCliAssertionFailures(result)).toEqual([]);
    expect(result.status).toBe("passed");
  });

  it("reports playwright-local unavailable safely with an explicit manifest", async () => {
    const fixture = createBrowserCliLocalFixtureManifestFixture({
      executorMode: "playwright-local",
    });
    cleanupFns.push(fixture.cleanup);
    const scenario: AgentCliScenario = {
      id: "cli-browser-playwright-unavailable",
      name: "playwright local unavailable path",
      metadata: { route: "101", capability: ["browser", "real-cli", "playwright-local-unavailable"] },
      steps: [
        {
          id: "observe",
          kind: "cli-command",
          prompt: "/browser execute observe local-fixture://route101-demo",
          env: fixture.env,
          assertions: [
            { id: "executed-no", kind: "executed-no" },
            { id: "mode", kind: "stdout-contains", text: "Mode: playwright-local" },
            { id: "runtime", kind: "stdout-contains", text: "Runtime: playwright-local unavailable" },
            { id: "availability", kind: "stdout-contains", text: "availability=unavailable" },
            { id: "dependency", kind: "stdout-contains", text: "Decision: external-runner-only" },
            { id: "cleanup", kind: "stdout-contains", text: "cleanup=not-started" },
            { id: "no-raw", kind: "no-raw-content-or-secrets" },
          ],
        },
      ],
      expectedOutcome: { status: "passed" },
    };

    const result = await runAgentCliScenario({
      scenario,
      projectPath: projectRoot(),
      homeDir: tempRoot("private-agents-cli-route101-home-"),
    });

    expect(agentCliAssertionFailures(result)).toEqual([]);
    expect(result.status).toBe("passed");
  });

  it("blocks external URL navigation even with a playwright-local manifest", async () => {
    const fixture = createBrowserCliLocalFixtureManifestFixture({
      executorMode: "playwright-local",
    });
    cleanupFns.push(fixture.cleanup);
    const scenario: AgentCliScenario = {
      id: "cli-browser-playwright-external-blocked",
      name: "playwright local external URL blocked",
      metadata: { route: "101", capability: ["browser", "real-cli", "network-blocked"] },
      steps: [
        {
          id: "navigate",
          kind: "cli-command",
          prompt: "/browser execute navigate https://example.com",
          env: fixture.env,
          assertions: [
            { id: "blocked", kind: "browser-execution-blocked" },
            { id: "executed-no", kind: "executed-no" },
            { id: "mode", kind: "stdout-contains", text: "Mode: playwright-local" },
            { id: "no-raw", kind: "no-raw-content-or-secrets" },
          ],
        },
      ],
      expectedOutcome: { status: "passed" },
    };

    const result = await runAgentCliScenario({
      scenario,
      projectPath: projectRoot(),
      homeDir: tempRoot("private-agents-cli-route101-home-"),
    });

    expect(agentCliAssertionFailures(result)).toEqual([]);
    expect(result.status).toBe("passed");
  });

  it("summarizes playwright-local evidence in the scenario report", async () => {
    const fixture = createBrowserCliLocalFixtureManifestFixture({
      executorMode: "playwright-local",
    });
    cleanupFns.push(fixture.cleanup);
    const scenario: AgentCliScenario = {
      id: "cli-browser-playwright-report",
      name: "playwright local report evidence",
      metadata: { route: "101", capability: ["browser", "real-cli", "report"] },
      steps: [
        {
          id: "observe",
          kind: "cli-command",
          prompt: "/browser execute observe local-fixture://route101-demo",
          env: fixture.env,
          assertions: [
            { id: "executed-no", kind: "executed-no" },
            { id: "mode", kind: "stdout-contains", text: "Mode: playwright-local" },
            { id: "manifest", kind: "stdout-contains", text: "Manifest status: valid" },
          ],
        },
      ],
      expectedOutcome: { status: "passed" },
    };

    const result = await runAgentCliScenario({
      scenario,
      projectPath: projectRoot(),
      homeDir: tempRoot("private-agents-cli-route101-home-"),
    });

    expect(agentCliAssertionFailures(result)).toEqual([]);
    const report = renderAgentCliScenarioReport(result);
    expect(report).toContain("Browser execution evidence: present; executed=no; mode=playwright-local; manifest=valid");
    expect(report).toContain("dependency=external-runner-only");
  });
});
