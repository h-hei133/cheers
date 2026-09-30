import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { agentCliAssertionFailures } from "../../cli/assertions.js";
import { createBrowserCliLocalFixtureManifestFixture } from "./fixtures.js";
import { renderAgentCliScenarioReport } from "../../cli/report.js";
import { runAgentCliScenario } from "../../cli/runner.js";
import type { AgentCliScenario } from "../../cli/model.js";

describe("browser CLI execution scenario examples", () => {
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
    const projectPath = tempRoot("cheers-cli-route100-project-");
    fs.writeFileSync(path.join(projectPath, "README.md"), "Route 100 fixture\n", "utf8");
    return projectPath;
  }

  it("keeps default browser execution blocked without a manifest", async () => {
    const scenario: AgentCliScenario = {
      id: "cli-browser-default-blocked",
      name: "default browser execution blocked",
      metadata: { route: "100", capability: ["browser", "real-cli", "blocked"] },
      steps: [
        {
          id: "execute",
          kind: "cli-command",
          prompt: "/browser execute observe local-fixture://route100-demo",
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
      homeDir: tempRoot("cheers-cli-route100-home-"),
    });

    expect(agentCliAssertionFailures(result)).toEqual([]);
    expect(result.status).toBe("passed");
  });

  it("blocks invalid manifests safely without exposing raw manifest content", async () => {
    const fixture = createBrowserCliLocalFixtureManifestFixture({
      unsafeManifest: {
        version: "browser-local-fixture-manifest/v1",
        source: "cli-harness",
        executorMode: "local-fixture",
        fixtures: [
          {
            id: "fixture:bad",
            kind: "static-page",
            title: "<main>sk-testsecret123</main>",
            url: "local-fixture://route100-demo",
            textSummary: "safe",
            allowedActions: ["observe"],
          },
        ],
        allowedLocalOrigins: ["local-fixture://route100-demo"],
        sandbox: { mode: "local-fixture", capabilities: ["observe"] },
      },
    });
    cleanupFns.push(fixture.cleanup);
    const scenario: AgentCliScenario = {
      id: "cli-browser-invalid-manifest",
      name: "invalid browser manifest blocked",
      metadata: { route: "100", capability: ["browser", "real-cli", "invalid-manifest"] },
      steps: [
        {
          id: "execute",
          kind: "cli-command",
          prompt: "/browser execute observe local-fixture://route100-demo",
          env: fixture.env,
          assertions: [
            { id: "blocked", kind: "browser-execution-blocked" },
            { id: "manifest-invalid", kind: "stdout-contains", text: "Manifest status: invalid" },
            { id: "executed-no", kind: "executed-no" },
            { id: "no-raw", kind: "no-raw-content-or-secrets" },
          ],
        },
      ],
      expectedOutcome: { status: "passed" },
    };

    const result = await runAgentCliScenario({
      scenario,
      projectPath: projectRoot(),
      homeDir: tempRoot("cheers-cli-route100-home-"),
    });

    expect(agentCliAssertionFailures(result)).toEqual([]);
    expect(result.status).toBe("passed");
  });

  it("runs local-fixture observe and extract through the real CLI", async () => {
    const fixture = createBrowserCliLocalFixtureManifestFixture();
    cleanupFns.push(fixture.cleanup);
    const scenario: AgentCliScenario = {
      id: "cli-browser-local-fixture-success",
      name: "local fixture browser execution succeeds",
      metadata: {
        route: "100",
        capability: ["browser", "real-cli", "local-fixture-execution"],
      },
      steps: [
        {
          id: "observe",
          kind: "cli-command",
          prompt: "/browser execute observe local-fixture://route100-demo",
          env: fixture.env,
          assertions: [
            { id: "executed", kind: "executed-yes" },
            { id: "mode", kind: "stdout-contains", text: "Mode: local-fixture" },
            { id: "source", kind: "stdout-contains", text: "Executor source: cli-harness" },
            { id: "manifest", kind: "stdout-contains", text: "Manifest status: valid" },
            { id: "safe-evidence", kind: "stdout-contains", text: "Route 100 safe local fixture summary" },
          ],
        },
        {
          id: "extract",
          kind: "cli-command",
          prompt: "/browser execute extract route100 summary",
          env: fixture.env,
          assertions: [
            { id: "executed", kind: "executed-yes" },
            { id: "mode", kind: "stdout-contains", text: "Mode: local-fixture" },
            { id: "extract-summary", kind: "stdout-contains", text: "Extraction summary" },
            { id: "no-raw", kind: "no-raw-content-or-secrets" },
          ],
        },
      ],
      expectedOutcome: { status: "passed" },
    };

    const result = await runAgentCliScenario({
      scenario,
      projectPath: projectRoot(),
      homeDir: tempRoot("cheers-cli-route100-home-"),
    });

    expect(agentCliAssertionFailures(result)).toEqual([]);
    expect(result.status).toBe("passed");
    const report = renderAgentCliScenarioReport(result);
    expect(report).toContain("Browser execution evidence: present; executed=yes; mode=local-fixture; manifest=valid");
    expect(report).toContain("dependency=external-runner-only");
  }, 20000);

  it("still blocks external URL navigation with a valid local fixture manifest", async () => {
    const fixture = createBrowserCliLocalFixtureManifestFixture();
    cleanupFns.push(fixture.cleanup);
    const scenario: AgentCliScenario = {
      id: "cli-browser-external-url-blocked",
      name: "external browser URL blocked",
      metadata: { route: "100", capability: ["browser", "real-cli", "network-blocked"] },
      steps: [
        {
          id: "navigate",
          kind: "cli-command",
          prompt: "/browser execute navigate https://example.com",
          env: fixture.env,
          assertions: [
            { id: "blocked", kind: "browser-execution-blocked" },
            { id: "executed-no", kind: "executed-no" },
            { id: "mode", kind: "stdout-contains", text: "Mode: local-fixture" },
            { id: "no-real-browser", kind: "stdout-contains", text: "Browser process: not launched" },
          ],
        },
      ],
      expectedOutcome: { status: "passed" },
    };

    const result = await runAgentCliScenario({
      scenario,
      projectPath: projectRoot(),
      homeDir: tempRoot("cheers-cli-route100-home-"),
    });

    expect(agentCliAssertionFailures(result)).toEqual([]);
    expect(result.status).toBe("passed");
  });
});
