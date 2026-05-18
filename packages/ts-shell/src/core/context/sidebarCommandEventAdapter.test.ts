import { describe, expect, it } from "vitest";
import {
  adaptCommandResultToSidebarEvent,
  emitSidebarCommandResult,
} from "./sidebarCommandEventAdapter.js";
import { createSidebarEventSink } from "./sidebarEventSink.js";
import { createSidebarLiveEventStore } from "./sidebarLiveEventStore.js";

describe("sidebar command event adapter", () => {
  it("maps compact, memory, and warmup outputs to concise events", () => {
    const compact = adaptCommandResultToSidebarEvent({
      command: "/compact",
      args: [],
      result: {
        kind: "local",
        output: [
          "Compact v2 handoff generated",
          "Result",
          "- Outcome: created",
          "- Checkpoint id: checkpoint-1",
          "- Persistence: none",
        ].join("\n"),
      },
    });
    expect(compact).toEqual(
      expect.objectContaining({
        kind: "compact",
        severity: "success",
        title: "Compact checkpoint",
      }),
    );
    expect(compact.summary).toContain("Checkpoint id: checkpoint-1");

    const memory = adaptCommandResultToSidebarEvent({
      command: "/memory",
      args: ["use", "secret", "query"],
      result: {
        kind: "local",
        output: [
          "Project memory use",
          "Result",
          "- Outcome: staged",
          "- Injection status: pending",
          "Project memory recall uses deterministic local search.",
        ].join("\n"),
      },
    });
    expect(memory.title).toBe("Memory use staged");
    expect(memory.summary).toContain("Injection status: pending");
    expect(memory.summary).not.toContain("deterministic local search");

    const warmup = adaptCommandResultToSidebarEvent({
      command: "/warmup",
      args: ["rebuild"],
      result: {
        kind: "local",
        output: [
          "Startup warm context",
          "Result",
          "- Outcome: rebuilt",
          "- Provider/model call: none",
          "- Startup auto-load: no",
        ].join("\n"),
      },
    });
    expect(warmup).toEqual(
      expect.objectContaining({
        kind: "warmup",
        severity: "success",
        title: "Warmup rebuilt",
      }),
    );
  });

  it("emits blocked results as preserved blocker events without raw output", () => {
    const store = createSidebarLiveEventStore();
    const sink = createSidebarEventSink({
      sessionScopeId: "session:adapter",
      store,
    });

    emitSidebarCommandResult(sink, {
      command: "/memory",
      args: ["save"],
      result: {
        kind: "local",
        output: [
          "Project memory store",
          "Result",
          "- Outcome: blocked",
          "- BlockerKind: memory-save-missing-target",
          "RAW_MEMORY_CONTENT sk-secret1234567890 hidden reasoning",
        ].join("\n"),
      },
    });

    const events = store.listRecent({ sessionScopeId: "session:adapter" }).events;
    expect(events).toEqual([
      expect.objectContaining({
        kind: "memory",
        severity: "blocked",
        title: "Memory saved",
      }),
    ]);
    expect(JSON.stringify(events)).not.toContain("RAW_MEMORY_CONTENT");
    expect(JSON.stringify(events)).not.toContain("sk-secret");
    expect(JSON.stringify(events)).not.toContain("hidden reasoning");
  });

  it("summarizes browser self-healing proposals without raw output", () => {
    const event = adaptCommandResultToSidebarEvent({
      command: "/browser",
      args: ["replay"],
      result: {
        kind: "local",
        output: [
          "Browser replay",
          "Result",
          "- Outcome: blocked",
          "- Repair readiness: repair-needs-runner",
          "Browser self-healing proposal",
          "- Proposal: add-runner-binding",
          "- Confidence: high",
          "- Proposed patch: runner-binding-patch",
          "RAW_BROWSER_EVIDENCE sk-secret1234567890 hidden reasoning",
        ].join("\n"),
      },
    });

    expect(event.title).toBe("Browser replay");
    expect(event.summary).toContain("Proposal: add-runner-binding");
    expect(event.summary).toContain("Confidence: high");
    expect(event.summary).not.toContain("RAW_BROWSER_EVIDENCE");
    expect(event.summary).not.toContain("sk-secret");
  });

  it("summarizes browser repair apply without raw output", () => {
    const event = adaptCommandResultToSidebarEvent({
      command: "/browser",
      args: ["repair"],
      result: {
        kind: "local",
        output: [
          "Browser self-healing apply",
          "Result",
          "- Outcome: applied",
          "- Proposal kind: repair-cache",
          "- Apply status: apply-allowed",
          "- Metadata/cache changed: yes",
          "- Manifest patch: patch-allowed",
          "- Browser executed: no",
          "- Replay executed: no",
          "RAW_APPLY_CONTENT sk-secret1234567890 hidden reasoning",
        ].join("\n"),
      },
    });

    expect(event.title).toBe("Browser repair");
    expect(event.summary).toContain("Apply status: apply-allowed");
    expect(event.summary).toContain("Metadata/cache changed: yes");
    expect(event.summary).toContain("Manifest patch: patch-allowed");
    expect(event.summary).not.toContain("RAW_APPLY_CONTENT");
    expect(event.summary).not.toContain("sk-secret");
  });

  it("summarizes external browser execution bridge without raw output", () => {
    const event = adaptCommandResultToSidebarEvent({
      command: "/browser",
      args: ["execute"],
      result: {
        kind: "local",
        output: [
          "External browser execution",
          "Result",
          "- Outcome: blocked",
          "- Origin: credential-url-redacted",
          "- Gate status: sandbox=future-runtime-required; allowlist=blocked-credential-url; confirmation=confirmed; preflight=blocked",
          "- Runner status: blocked-runner-disabled",
          "- Runner manifest: valid",
          "- Handoff status: blocked-unsafe-url",
          "- Real network execution: no",
          "- Risk receipt: browser-external-network-receipt:route116",
          "- Executed: no",
          "- Network access: none",
          "https://user:pass@example.com RAW_BROWSER_EVIDENCE sk-secret1234567890 hidden reasoning",
        ].join("\n"),
      },
    });

    expect(event.title).toBe("Browser execution");
    expect(event.summary).toContain("Origin: credential-url-redacted");
    expect(event.summary).toContain("Runner status: blocked-runner-disabled");
    expect(event.summary).toContain("Handoff status: blocked-unsafe-url");
    expect(event.summary).toContain("Real network execution: no");
    expect(event.summary).toContain("Executed: no");
    expect(event.summary).not.toContain("user:pass");
    expect(event.summary).not.toContain("RAW_BROWSER_EVIDENCE");
    expect(event.summary).not.toContain("sk-secret");
  });

  it("swallows non-safety sink failures", () => {
    expect(() =>
      emitSidebarCommandResult(
        {
          emitUserVisible: () => {
            throw new Error("sink unavailable");
          },
          emitDeveloperOnly: () => {
            throw new Error("sink unavailable");
          },
          emitWarning: () => {
            throw new Error("sink unavailable");
          },
          emitBlocker: () => {
            throw new Error("sink unavailable");
          },
        },
        {
          command: "/warmup",
          args: ["status"],
          result: {
            kind: "local",
            output: "Startup warm context\nResult\n- Outcome: status",
          },
        },
      ),
    ).not.toThrow();
  });
});
