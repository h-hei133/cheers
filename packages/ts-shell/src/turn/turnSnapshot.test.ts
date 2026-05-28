import { describe, expect, it } from "vitest";

import { createRuntimeTurnSnapshot } from "./turnSnapshot.js";

describe("runtime turn snapshot", () => {
  it("freezes a report-safe structural snapshot", () => {
    const flags = ["verify-after-edit"];
    const snapshot = createRuntimeTurnSnapshot({
      sessionId: "sess-snapshot",
      turn: 2,
      phase: "turn",
      workspaceRoot: "/tmp/workspace",
      providerMode: "real",
      providerOptIn: true,
      modelLabel: "codex-test-model",
      agentMode: "build",
      capabilityFlags: flags,
      planningMutationExecution: "provided",
      executionBoundaryMode: "ExecutionService",
      evidenceCorrelationIds: ["evidence:one"],
    });

    flags.push("later-change");

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.capabilityFlags)).toBe(true);
    expect(snapshot.capabilityFlags).toEqual(["verify-after-edit"]);
    expect(snapshot.phase).toBe("turn");
    expect(snapshot.provider).toEqual({
      mode: "real",
      optIn: true,
      modelLabel: "codex-test-model",
    });
  });

  it("redacts unsafe provider, edit, and command details", () => {
    const snapshot = createRuntimeTurnSnapshot({
      sessionId: "sess-redact",
      turn: 1,
      phase: "turn",
      workspaceRoot: "/home/wang/.private-agents-real/provider-home",
      providerMode: "real",
      providerOptIn: true,
      modelLabel: "model api_key=secret-value",
      capabilityFlags: [
        "oldText: raw original",
        "newText: raw replacement",
        "stdout raw command output",
      ],
    });
    const serialized = JSON.stringify(snapshot);

    expect(serialized).not.toContain("secret-value");
    expect(serialized).not.toContain("/home/wang/.private-agents-real");
    expect(serialized).not.toContain("raw original");
    expect(serialized).not.toContain("raw replacement");
    expect(serialized).not.toContain("raw command output");
    expect(snapshot.redaction.status).toBe("report-safe");
  });
});

