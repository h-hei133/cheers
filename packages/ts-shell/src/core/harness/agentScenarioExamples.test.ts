import { afterEach, describe, expect, it } from "vitest";
import { createAgentScenarioFixtureContext, seedProjectMemoryRecord } from "./agentScenarioFixtures.js";
import { renderAgentScenarioReport } from "./agentScenarioReport.js";
import { runAgentScenario } from "./agentScenarioRunner.js";
import type { AgentScenario, AgentScenarioFixtureContext } from "./agentScenarioModel.js";

describe("agent scenario harness foundation", () => {
  const contexts: AgentScenarioFixtureContext[] = [];

  afterEach(() => {
    while (contexts.length > 0) {
      contexts.pop()?.cleanup?.();
    }
  });

  function context(scenarioId: string): AgentScenarioFixtureContext {
    const fixture = createAgentScenarioFixtureContext({ scenarioId });
    contexts.push(fixture);
    return fixture;
  }

  it("runs compact + memory + sidebar continuity with one-shot injection evidence", async () => {
    const scenario: AgentScenario = {
      id: "compact-memory-sidebar",
      name: "compact + memory + sidebar continuity",
      steps: [
        { id: "compact", kind: "command", input: "/compact" },
        { id: "normal-after-compact", kind: "simulated-user-turn" },
        { id: "memory-review", kind: "command", input: "/memory" },
        { id: "memory-approve", kind: "command", input: "/memory approve --all-safe" },
        { id: "memory-save", kind: "command", input: "/memory save approved" },
        { id: "memory-recall", kind: "command", input: "/memory recall compact" },
        { id: "memory-use", kind: "command", input: "/memory use" },
        { id: "normal-after-memory", kind: "simulated-user-turn" },
        { id: "sidebar-panel", kind: "command", input: "/sidebar panel" },
      ],
      expectedOutcome: {
        status: "passed",
        assertions: [
          { id: "compact-once", kind: "compact-injected-once" },
          { id: "memory-once", kind: "memory-injected-once" },
          { id: "sidebar-activity", kind: "sidebar-event-emitted", eventTitle: "Memory use staged" },
          { id: "next-action", kind: "next-action-exists", stepId: "normal-after-memory" },
          { id: "memory-saved", kind: "memory-record-saved" },
          { id: "no-raw", kind: "output-not-contains", text: "RAW_SECRET" },
        ],
      },
    };

    const result = await runAgentScenario({
      scenario,
      context: context(scenario.id),
    });
    const report = renderAgentScenarioReport(result);

    expect(result.status).toBe("passed");
    expect(result.evidence).toContain("compact-future-turn-injection:injected-once");
    expect(result.evidence).toContain("project-memory-future-turn-injection:injected-once");
    expect(result.sidebarEvents.map((event) => event.title)).toContain("Memory use staged");
    expect(report).toContain("Agent scenario report");
    expect(report).toContain("- Status: passed");
  });

  it("proves invalidated memory is excluded from later recall", async () => {
    const fixture = context("memory-lifecycle");
    await seedProjectMemoryRecord(fixture, {
      id: "pmr:scenario-lifecycle",
      memoryText: "Scenario lifecycle memory should disappear after invalidation.",
    });
    const scenario: AgentScenario = {
      id: "memory-lifecycle",
      name: "memory lifecycle safety",
      steps: [
        { id: "recall-before", kind: "command", input: "/memory recall lifecycle" },
        { id: "invalidate", kind: "command", input: "/memory invalidate pmr:scenario-lifecycle stale" },
        { id: "recall-after", kind: "command", input: "/memory recall lifecycle" },
      ],
      expectedOutcome: {
        status: "passed",
        assertions: [
          { id: "before-count", kind: "output-contains", stepId: "recall-before", text: "Result count: 1" },
          { id: "after-excluded", kind: "invalidated-deleted-memory-excluded", stepId: "recall-after" },
        ],
      },
    };

    const result = await runAgentScenario({ scenario, context: fixture });

    expect(result.status).toBe("passed");
    expect(result.steps.find((step) => step.stepId === "recall-after")?.output).toContain("Result count: 0");
  });

  it("captures browser dry-run visibility without browser execution", async () => {
    const scenario: AgentScenario = {
      id: "browser-dry-run",
      name: "browser dry-run visibility",
      steps: [
        { id: "dry-run", kind: "command", input: "/browser dry-run navigate https://example.test" },
        { id: "sidebar", kind: "command", input: "/sidebar" },
      ],
      expectedOutcome: {
        status: "passed",
        assertions: [
          { id: "executed-no", kind: "browser-dry-run-executed-no", stepId: "dry-run" },
          { id: "browser-event", kind: "sidebar-event-emitted", eventTitle: "Browser dry-run" },
          { id: "no-execution-claim", kind: "output-not-contains", text: "Executed: yes" },
        ],
      },
    };

    const result = await runAgentScenario({
      scenario,
      context: context(scenario.id),
    });

    expect(result.status).toBe("passed");
    expect(result.steps.find((step) => step.stepId === "dry-run")?.output).toContain("Executed: no");
  });

  it("runs warmup cache preview with explicit temp roots and no model injection", async () => {
    const scenario: AgentScenario = {
      id: "warmup-preview",
      name: "warmup cache preview",
      steps: [
        { id: "warmup-rebuild", kind: "command", input: "/warmup rebuild" },
        { id: "warmup-status", kind: "command", input: "/warmup status" },
        { id: "sidebar-panel", kind: "command", input: "/sidebar panel" },
      ],
      expectedOutcome: {
        status: "passed",
        assertions: [
          { id: "warmup-status", kind: "output-contains", stepId: "warmup-status", text: "Startup warm context" },
          { id: "no-model-injection", kind: "output-contains", stepId: "warmup-rebuild", text: "Injected into model: no" },
          { id: "warmup-event", kind: "sidebar-event-emitted", eventTitle: "Warmup rebuilt" },
        ],
      },
    };

    const result = await runAgentScenario({
      scenario,
      context: context(scenario.id),
    });

    expect(result.status).toBe("passed");
    expect(result.evidence.some((item) => item.includes("warmup"))).toBe(true);
  });
});
