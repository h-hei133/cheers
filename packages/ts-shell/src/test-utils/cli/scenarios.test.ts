import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { agentCliAssertionFailures } from "./assertions.js";
import { renderAgentCliScenarioReport } from "./report.js";
import { runAgentCliScenario } from "./runner.js";
import type { AgentCliScenario } from "./model.js";

describe("Agent CLI scenario harness", () => {
  const tempRoots: string[] = [];

  afterEach(() => {
    for (const root of tempRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  function tempProject(): string {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "cheers-cli-scenario-project-"),
    );
    fs.writeFileSync(
      path.join(root, "README.md"),
      "CLI scenario fixture\n",
      "utf8",
    );
    tempRoots.push(root);
    return root;
  }

  function tempHome(): string {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "cheers-cli-scenario-home-"),
    );
    tempRoots.push(root);
    return root;
  }

  async function runScenario(scenario: AgentCliScenario) {
    const result = await runAgentCliScenario({
      scenario,
      projectPath: tempProject(),
      homeDir: tempHome(),
      now: (() => {
        let index = 0;
        return () =>
          new Date(Date.UTC(2026, 4, 17, 2, 0, index++)).toISOString();
      })(),
    });
    expect(agentCliAssertionFailures(result)).toEqual([]);
    return result;
  }

  it("runs browser dry-run through the real CLI child process", async () => {
    const result = await runScenario({
      id: "cli-browser-dry-run",
      name: "browser dry-run through real CLI",
      metadata: {
        route: "98",
        capability: ["browser", "dry-run", "real-cli"],
      },
      steps: [
        {
          id: "browser-dry-run",
          kind: "cli-command",
          prompt: "/browser dry-run navigate https://example.com",
          assertions: [
            {
              id: "dry-run-output",
              kind: "stdout-contains",
              text: "Browser dry-run",
            },
            { id: "executed-no", kind: "executed-no" },
            {
              id: "no-browser-process",
              kind: "stdout-contains",
              text: "Browser process: not launched",
            },
            {
              id: "no-network",
              kind: "stdout-contains",
              text: "Network access: none",
            },
          ],
        },
      ],
      expectedOutcome: { status: "passed" },
    });

    expect(result.evidence).toContain("agent-cli-scenario-runner:real-cli-child-process");
    expect(renderAgentCliScenarioReport(result)).toContain("Agent CLI scenario report");
  }, 20000);

  it("runs blocked browser execute through the real CLI child process", async () => {
    const result = await runScenario({
      id: "cli-browser-execute-blocked",
      name: "browser execute blocked through real CLI",
      metadata: {
        route: "98",
        capability: ["browser", "execute", "blocked", "real-cli"],
      },
      steps: [
        {
          id: "browser-execute",
          kind: "cli-command",
          prompt: "/browser execute navigate https://example.com",
          assertions: [
            {
              id: "browser-execution-output",
              kind: "stdout-contains",
              text: "External browser execution",
            },
            { id: "blocked", kind: "browser-execution-blocked" },
            { id: "executed-no", kind: "executed-no" },
            {
              id: "no-browser-process",
              kind: "stdout-contains",
              text: "Browser process: not launched",
            },
          ],
        },
      ],
      expectedOutcome: { status: "passed" },
    });

    expect(result.nextAction).toContain("allowlist");
  });

  it("runs sidebar panel through the real CLI child process", async () => {
    const result = await runScenario({
      id: "cli-sidebar-panel",
      name: "sidebar panel through real CLI",
      metadata: {
        route: "98",
        capability: ["sidebar", "real-cli"],
      },
      steps: [
        {
          id: "sidebar-panel",
          kind: "cli-command",
          prompt: "/sidebar panel",
          assertions: [
            { id: "panel", kind: "sidebar-panel-exists" },
            {
              id: "boundary",
              kind: "stdout-contains",
              text: "No provider/model calls",
            },
          ],
        },
      ],
      expectedOutcome: { status: "passed" },
    });

    expect(result.steps[0]?.process.output.stdout).toContain(
      "Visible agent state panel",
    );
  });

  it("runs warmup status through the real CLI child process", async () => {
    const result = await runScenario({
      id: "cli-warmup-status",
      name: "warmup status through real CLI",
      metadata: {
        route: "98",
        capability: ["warmup", "real-cli"],
      },
      steps: [
        {
          id: "warmup-status",
          kind: "cli-command",
          prompt: "/warmup status",
          assertions: [
            {
              id: "warmup",
              kind: "stdout-contains",
              text: "Startup warm context",
            },
            {
              id: "disabled",
              kind: "stdout-contains",
              text: "Cache mode: disabled",
            },
            {
              id: "no-startup-autoload",
              kind: "stdout-contains",
              text: "Startup auto-load: no",
            },
          ],
        },
      ],
      expectedOutcome: { status: "passed" },
    });

    expect(result.status).toBe("passed");
  });
});
