import { describe, expect, it } from "vitest";
import { FakeBrowserExecutor } from "../context/browserExecutor.js";
import { createAgentScenarioFixtureContext } from "./agentScenarioFixtures.js";
import { runAgentScenario } from "./agentScenarioRunner.js";
import type { AgentScenario } from "./agentScenarioModel.js";

describe("browser scenario examples", () => {
  it("covers blocked default browser execution", async () => {
    const context = createAgentScenarioFixtureContext({
      scenarioId: "browser-execute-blocked",
    });
    const scenario: AgentScenario = {
      id: "browser-execute-blocked",
      name: "browser execute blocked by default",
      metadata: { route: "route96", capability: ["browser-execution"] },
      steps: [
        { id: "execute", kind: "command", input: "/browser execute navigate https://example.com" },
        { id: "sidebar", kind: "command", input: "/sidebar" },
      ],
      expectedOutcome: {
        status: "passed",
        assertions: [
          { id: "blocked", kind: "output-contains", stepId: "execute", text: "blocked-no-executor" },
          { id: "executed-no", kind: "output-contains", stepId: "execute", text: "- Executed: no" },
          { id: "browser-event", kind: "sidebar-event-emitted", eventTitle: "Browser execution" },
          { id: "no-secret", kind: "output-not-contains", stepId: "execute", text: "sk-" },
        ],
      },
    };

    const result = await runAgentScenario({ scenario, context });
    try {
      expect(result.status).toBe("passed");
      expect(result.evidence).toContain("agent-scenario-runner:no-browser-execution");
      expect(result.sidebarEvents.map((event) => event.title)).toContain("Browser execution");
    } finally {
      context.cleanup();
    }
  });

  it("covers fake/test browser execution success", async () => {
    const context = createAgentScenarioFixtureContext({
      scenarioId: "browser-execute-fake-success",
      browserExecutor: new FakeBrowserExecutor(),
    });
    const scenario: AgentScenario = {
      id: "browser-execute-fake-success",
      name: "browser fake executor success",
      metadata: { route: "route96", capability: ["browser-execution", "browser-fake-execution"] },
      steps: [
        { id: "execute", kind: "command", input: "/browser execute observe" },
        { id: "sidebar", kind: "command", input: "/sidebar panel" },
      ],
      expectedOutcome: {
        status: "passed",
        assertions: [
          { id: "executed", kind: "output-contains", stepId: "execute", text: "- Executed: yes" },
          { id: "fake", kind: "output-contains", stepId: "execute", text: "fake/test browser executor" },
          { id: "browser-event", kind: "sidebar-event-emitted", eventTitle: "Browser execution" },
        ],
      },
    };

    const result = await runAgentScenario({ scenario, context });
    try {
      expect(result.status).toBe("passed");
      expect(result.evidence).toContain("agent-scenario-runner:fake-browser-execution-only");
      expect(result.safetyChecks.every((check) => check.status === "passed")).toBe(true);
    } finally {
      context.cleanup();
    }
  });

  it("keeps browser dry-run non-executing without an executor", async () => {
    const context = createAgentScenarioFixtureContext({
      scenarioId: "browser-dry-run-still-non-executing",
    });
    const scenario: AgentScenario = {
      id: "browser-dry-run-still-non-executing",
      name: "browser dry-run remains non-executing",
      metadata: { route: "route96", capability: ["browser-dry-run"] },
      steps: [
        { id: "dry-run", kind: "command", input: "/browser dry-run navigate https://example.com" },
      ],
      expectedOutcome: {
        status: "passed",
        assertions: [
          { id: "executed-no", kind: "browser-dry-run-executed-no", stepId: "dry-run" },
          { id: "no-executor-required", kind: "output-contains", stepId: "dry-run", text: "Browser process: not launched" },
        ],
      },
    };

    const result = await runAgentScenario({ scenario, context });
    try {
      expect(result.status).toBe("passed");
      expect(result.evidence).toContain("agent-scenario-runner:no-browser-execution");
    } finally {
      context.cleanup();
    }
  });
});
