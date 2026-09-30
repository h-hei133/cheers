import { describe, expect, it } from "vitest";
import { FakeBrowserExecutor } from "../../browser/executor.js";
import { createBrowserNetworkAllowlist } from "../../browser/networkAllowlist.js";
import { createBrowserSandboxAuthority } from "../../browser/sandboxAuthority.js";
import { createAgentScenarioFixtureContext } from "../../test-utils/scenarios/fixtures.js";
import { runAgentScenario } from "../../test-utils/scenarios/runner.js";
import type { AgentScenario } from "../../test-utils/scenarios/model.js";

describe("browser sandbox scenario examples", () => {
  it("covers browser execution blocked by missing sandbox authority", async () => {
    const context = createAgentScenarioFixtureContext({
      scenarioId: "browser-sandbox-missing-authority",
      browserExecutor: new FakeBrowserExecutor(),
    });
    const scenario: AgentScenario = {
      id: "browser-sandbox-missing-authority",
      name: "browser execution blocked by missing sandbox authority",
      metadata: { route: "route97", capability: ["browser-sandbox"] },
      steps: [
        { id: "execute", kind: "command", input: "/browser execute observe" },
        { id: "sidebar", kind: "command", input: "/sidebar" },
      ],
      expectedOutcome: {
        status: "passed",
        assertions: [
          { id: "preflight-blocked", kind: "output-contains", stepId: "execute", text: "- Preflight status: blocked" },
          { id: "authority-disabled", kind: "output-contains", stepId: "execute", text: "- Sandbox authority: disabled" },
          { id: "executed-no", kind: "output-contains", stepId: "execute", text: "- Executed: no" },
          { id: "browser-event", kind: "sidebar-event-emitted", eventTitle: "Browser execution" },
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

  it("covers browser execution blocked by network allowlist", async () => {
    const context = createAgentScenarioFixtureContext({
      scenarioId: "browser-sandbox-network-blocked",
      browserExecutor: new FakeBrowserExecutor(),
      browserSandboxAuthority: createBrowserSandboxAuthority({ mode: "fake-test" }),
    });
    const scenario: AgentScenario = {
      id: "browser-sandbox-network-blocked",
      name: "browser execution blocked by network allowlist",
      metadata: { route: "route97", capability: ["browser-sandbox"] },
      steps: [
        { id: "execute", kind: "command", input: "/browser execute navigate https://example.com" },
      ],
      expectedOutcome: {
        status: "passed",
        assertions: [
          { id: "allowlist-blocked", kind: "output-contains", stepId: "execute", text: "- Network allowlist: blocked-no-allowlist" },
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

  it("covers fake-test execution allowed by authority, allowlist, and confirmation", async () => {
    const requestId = "browser-exec:navigate-https-example-com";
    const context = createAgentScenarioFixtureContext({
      scenarioId: "browser-sandbox-fake-allowed",
      browserExecutor: new FakeBrowserExecutor(),
      browserSandboxAuthority: createBrowserSandboxAuthority({ mode: "fake-test" }),
      browserNetworkAllowlist: createBrowserNetworkAllowlist({
        allowedOrigins: [{ origin: "https://example.com", mode: "fake-test" }],
      }),
      browserExecutionConfirmations: [{ kind: "network", status: "confirmed", requestId }],
    });
    const scenario: AgentScenario = {
      id: "browser-sandbox-fake-allowed",
      name: "browser fake-test execution allowed by preflight",
      metadata: { route: "route97", capability: ["browser-sandbox", "browser-fake-execution"] },
      steps: [
        { id: "execute", kind: "command", input: "/browser execute navigate https://example.com" },
        { id: "sidebar", kind: "command", input: "/sidebar panel" },
      ],
      expectedOutcome: {
        status: "passed",
        assertions: [
          { id: "executed", kind: "output-contains", stepId: "execute", text: "- Executed: yes" },
          { id: "allowlist", kind: "output-contains", stepId: "execute", text: "- Network allowlist: allowed" },
          { id: "confirmed", kind: "output-contains", stepId: "execute", text: "- Confirmation status: confirmed" },
          { id: "browser-event", kind: "sidebar-event-emitted", eventTitle: "Browser execution" },
        ],
      },
    };

    const result = await runAgentScenario({ scenario, context });
    try {
      expect(result.status).toBe("passed");
      expect(result.evidence).toContain("agent-scenario-runner:fake-browser-execution-only");
    } finally {
      context.cleanup();
    }
  });

  it("covers dry-run sandbox requirements without execution", async () => {
    const context = createAgentScenarioFixtureContext({
      scenarioId: "browser-sandbox-dry-run",
    });
    const scenario: AgentScenario = {
      id: "browser-sandbox-dry-run",
      name: "browser dry-run shows sandbox requirements",
      metadata: { route: "route97", capability: ["browser-dry-run"] },
      steps: [
        { id: "dry-run", kind: "command", input: "/browser dry-run navigate https://example.com" },
      ],
      expectedOutcome: {
        status: "passed",
        assertions: [
          { id: "sandbox", kind: "output-contains", stepId: "dry-run", text: "- Sandbox decision: future-sandbox-required" },
          { id: "network", kind: "output-contains", stepId: "dry-run", text: "- Network access: none" },
          { id: "executed-no", kind: "browser-dry-run-executed-no", stepId: "dry-run" },
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
