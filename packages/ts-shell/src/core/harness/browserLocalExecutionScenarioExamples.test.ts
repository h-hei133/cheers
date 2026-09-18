import { describe, expect, it } from "vitest";
import { createBrowserSandboxAuthority } from "../../browser/sandboxAuthority.js";
import { BrowserPlaywrightCliLocalFixtureExecutor } from "../../browser/playwrightCliExecutor.js";
import { createAgentScenarioFixtureContext } from "./agentScenarioFixtures.js";
import { runAgentScenario } from "./agentScenarioRunner.js";
import type { AgentScenario } from "./agentScenarioModel.js";

describe("browser local execution scenario examples", () => {
  it("covers default execution blocked for observe", async () => {
    const context = createAgentScenarioFixtureContext({
      scenarioId: "browser-local-default-blocked",
    });
    const scenario: AgentScenario = {
      id: "browser-local-default-blocked",
      name: "browser observe blocked by default",
      metadata: { route: "route99", capability: ["browser-execution"] },
      steps: [{ id: "execute", kind: "command", input: "/browser execute observe" }],
      expectedOutcome: {
        status: "passed",
        assertions: [
          { id: "blocked", kind: "output-contains", stepId: "execute", text: "blocked-no-executor" },
          { id: "executed-no", kind: "output-contains", stepId: "execute", text: "- Executed: no" },
        ],
      },
    };

    const result = await runAgentScenario({ scenario, context });
    try {
      expect(result.status).toBe("passed");
    } finally {
      context.cleanup();
    }
  });

  it("covers local fixture observe and sidebar event", async () => {
    const context = createAgentScenarioFixtureContext({
      scenarioId: "browser-local-observe-success",
      browserExecutor: new BrowserPlaywrightCliLocalFixtureExecutor(),
      browserSandboxAuthority: createBrowserSandboxAuthority({ mode: "local-fixture" }),
    });
    const scenario: AgentScenario = {
      id: "browser-local-observe-success",
      name: "browser local fixture observe success",
      metadata: {
        route: "route99",
        capability: ["browser-execution", "browser-local-fixture-execution"],
      },
      steps: [
        { id: "execute", kind: "command", input: "/browser execute observe" },
        { id: "sidebar", kind: "command", input: "/sidebar panel" },
      ],
      expectedOutcome: {
        status: "passed",
        assertions: [
          { id: "executed", kind: "output-contains", stepId: "execute", text: "- Executed: yes" },
          { id: "mode", kind: "output-contains", stepId: "execute", text: "- Mode: local-fixture" },
          { id: "sanitized", kind: "output-not-contains", stepId: "execute", text: "<html" },
          { id: "browser-event", kind: "sidebar-event-emitted", eventTitle: "Browser execution" },
        ],
      },
    };

    const result = await runAgentScenario({ scenario, context });
    try {
      expect(result.status).toBe("passed");
      expect(result.evidence).toContain("agent-scenario-runner:local-fixture-browser-execution-only");
    } finally {
      context.cleanup();
    }
  });

  it("covers local fixture extract, local navigation, and external URL block", async () => {
    const context = createAgentScenarioFixtureContext({
      scenarioId: "browser-local-extract-and-external-block",
      browserExecutor: new BrowserPlaywrightCliLocalFixtureExecutor(),
      browserSandboxAuthority: createBrowserSandboxAuthority({ mode: "local-fixture" }),
    });
    const scenario: AgentScenario = {
      id: "browser-local-extract-and-external-block",
      name: "browser local fixture extract plus external block",
      metadata: {
        route: "route99",
        capability: ["browser-execution", "browser-local-fixture-execution"],
      },
      continueOnFailure: true,
      steps: [
        { id: "extract", kind: "command", input: "/browser execute extract headline" },
        { id: "navigate-local", kind: "command", input: "/browser execute navigate local-fixture://route99" },
        { id: "external", kind: "command", input: "/browser execute navigate https://example.com" },
      ],
      expectedOutcome: {
        status: "passed",
        assertions: [
          { id: "extract-executed", kind: "output-contains", stepId: "extract", text: "- Executed: yes" },
          { id: "extract-summary", kind: "output-contains", stepId: "extract", text: "Extraction summary:" },
          { id: "no-secret", kind: "output-not-contains", stepId: "extract", text: "sk-" },
          { id: "local-navigate", kind: "output-contains", stepId: "navigate-local", text: "- Executed: yes" },
          { id: "local-allowlist", kind: "output-contains", stepId: "navigate-local", text: "- Network allowlist: allowed" },
          { id: "external-blocked", kind: "output-contains", stepId: "external", text: "- Network allowlist: blocked-no-allowlist" },
          { id: "external-executed-no", kind: "output-contains", stepId: "external", text: "- Executed: no" },
        ],
      },
    };

    const result = await runAgentScenario({ scenario, context });
    try {
      expect(result.status).toBe("passed");
    } finally {
      context.cleanup();
    }
  });
});
