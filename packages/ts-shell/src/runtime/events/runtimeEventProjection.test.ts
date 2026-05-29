import { describe, expect, it } from "vitest";

import { createEvidenceOnlySavePoint } from "../../evidence/runtimeSavePoint.js";
import { applyExtensionHookPolicy } from "../extensions/lifecycle.js";
import { projectStaticResourceRegistry } from "../resources/staticResourceProjection.js";
import { projectSessionTree } from "../../session/sessionTreeProjection.js";
import { createCommandExecutionReceipt } from "../execution/executionReceipt.js";
import { createRuntimeTurnSnapshot } from "../../turn/turnSnapshot.js";
import { projectRuntimeEvents } from "./runtimeEventProjection.js";

describe("runtime event projection", () => {
  it("projects BI002 and BI003 facts in stable observation order", () => {
    const snapshot = createRuntimeTurnSnapshot({
      sessionId: "sess-events",
      turn: 1,
      phase: "turn",
      workspaceRoot: "/tmp/workspace",
      providerOptIn: false,
    });
    const receipt = createCommandExecutionReceipt({
      request: {
        operationKind: "command.run",
        command: "sh",
        args: ["-c", "printf ok"],
        cwd: "/tmp/workspace",
        workspaceRoot: "/tmp/workspace",
        authority: {
          mode: "command-allowlisted",
          source: "tool-runtime-approval",
          reason: "test authority",
        },
        caller: "core-tool:bash",
        reason: "test events receipt",
        reportSafeCommand: "printf ok",
      },
      result: {
        status: "completed",
        exitCode: 0,
        stdout: "ok",
        stderr: "",
      },
    });
    const savePoint = createEvidenceOnlySavePoint({
      turnSnapshot: snapshot,
      phase: "save_point",
      evidenceIds: ["verification:not-run"],
      executionReceipts: [receipt],
    });

    const events = projectRuntimeEvents({
      turnSnapshot: snapshot,
      executionReceipts: [receipt],
      savePoint,
      resultFacts: {
        status: "stopped_error",
        terminalClassification: "stopped",
        terminalReason: "stopped_error",
        verdictSource: "result",
      },
    });

    expect(events.map((event) => event.type)).toEqual([
      "turn-snapshot-observed",
      "phase-observed",
      "execution-receipt-observed",
      "save-point-observed",
      "result-facts-observed",
      "terminal-verdict-observed",
    ]);
    expect(events.map((event) => event.sequence)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(events[2]?.facts).toMatchObject({
      receiptId: receipt.receiptId,
      executionStatus: "success",
      errorClass: "success",
    });
    expect(events[4]?.facts).toMatchObject({
      terminalSuccessClaim: false,
      terminalClassification: "stopped",
    });
  });

  it("redacts unsafe event fields and avoids raw tool content", () => {
    const events = projectRuntimeEvents({
      toolResults: [
        {
          success: false,
          output: "raw provider output: hidden reasoning sk-1234567890",
          error: "oldText=raw-before newText=raw-after",
          content: "token=secret-value /home/wang/.private-agents-real/provider.env",
          details: {
            raw: "<html>full file contents</html>",
          },
          reportSafe: {
            redactionStatus: "redacted",
            notProvenClaims: ["tool-result-success"],
          },
        },
      ],
      resultFacts: {
        status: "stopped_error",
        terminalClassification: "stopped",
        terminalReason:
          "Authorization: Bearer abc /home/wang/.private-agents-real/provider.env",
      },
    });
    const serialized = JSON.stringify(events);

    expect(serialized).not.toMatch(
      /hidden reasoning|sk-1234567890|raw-before|raw-after|secret-value|private-agents-real|full file contents/i,
    );
    expect(serialized).toContain("[redacted-real-provider-home]");
    expect(serialized).toContain("[secret-redacted]");
    expect(events.some((event) => event.redaction.status === "redacted")).toBe(true);
  });

  it("keeps session projection and terminal observations evidence-only", () => {
    const sessionProjection = projectSessionTree({
      session: {
        id: "sess-tree-event",
        projectRoot: "/workspace",
        createdAt: "2026-05-19T00:00:00.000Z",
        updatedAt: "2026-05-19T00:00:00.000Z",
        status: "completed",
        turns: [],
      },
      stateSnapshot: {
        status: "completed",
        terminalClassification: "success",
        terminalReason: "completed",
      },
    });

    const events = projectRuntimeEvents({
      sessionProjection,
      resultFacts: {
        status: "completed",
        terminalClassification: "success",
        terminalReason: "completed",
        verdictSource: "result",
      },
    });

    expect(JSON.stringify(events)).not.toContain('"success":true');
    expect(
      events.every((event) => event.facts.terminalSuccessClaim !== true),
    ).toBe(true);
    expect(events.flatMap((event) => event.notProvenClaims)).toContain(
      "terminal-success",
    );
  });

  it("projects static resource metadata without discovery, execution, or success claims", () => {
    const resourceProjection = projectStaticResourceRegistry({
      descriptors: [
        {
          id: "provider.safe",
          kind: "provider-metadata",
          name: "Safe Provider Metadata",
          description: "Metadata only.",
          sourceType: "fixture",
          ownerDomain: "runtime/resources",
          visibility: "runtime",
          enabledByDefault: false,
          requiresOptIn: true,
          capabilitiesSummary: ["text"],
          riskLevel: "high",
          providerMetadata: {
            providerLabel: "openai-compatible",
            endpointClass: "openai-compatible",
            capabilityFlags: ["text"],
            defaultEnabled: false,
            requiresOptIn: true,
          },
          notProvenClaims: [],
        },
      ],
    });

    const events = projectRuntimeEvents({ resourceProjection });
    const event = events.find(
      (candidate) => candidate.type === "resource-projection-observed",
    );

    expect(event?.facts).toMatchObject({
      registryMode: "explicit-static",
      dynamicDiscovery: "disabled",
      packageLoading: "disabled",
      pluginExecution: "disabled",
      providerDefaultEnablement: "disabled",
      resourceCount: 1,
      providerResourceCount: 1,
      terminalSuccessClaim: false,
    });
    expect(JSON.stringify(events)).not.toContain('"success":true');
    expect(event?.notProvenClaims).toEqual(
      expect.arrayContaining([
        "resource-execution",
        "provider-success",
        "tool-success",
        "verification-success",
        "terminal-success",
      ]),
    );
  });

  it("projects extension hook policy outcomes as observations only", () => {
    const hookOutcome = applyExtensionHookPolicy({
      descriptor: {
        hookId: "extension.safe.tool.observe",
        extensionId: "extension.safe",
        eventKind: "tool-call-prepared",
        ownerDomain: "runtime/extensions",
        allowedEffect: "block-action",
        riskLevel: "medium",
        requiresOptIn: true,
        supported: false,
        executable: false,
        registrationMode: "static-internal",
        notProvenClaims: [],
      },
      requestedEffect: "block-action",
      summary:
        "Blocked unsafe projection with provider.env=/home/wang/.private-agents-real/provider.env",
      evidenceAnnotations: ["extension-hook:block-action"],
    });

    const events = projectRuntimeEvents({
      hookPolicyOutcomes: [hookOutcome],
    });
    const event = events.find(
      (candidate) => candidate.type === "extension-hook-policy-observed",
    );
    const serialized = JSON.stringify(events);

    expect(event?.facts).toMatchObject({
      hookId: "extension.safe.tool.observe",
      extensionId: "extension.safe",
      eventKind: "tool-call-prepared",
      requestedEffect: "block-action",
      acceptedEffect: "block-action",
      policyStatus: "accepted",
      terminalSuccessClaim: false,
    });
    expect(serialized).not.toContain("/home/wang/.private-agents-real");
    expect(serialized).not.toContain('"success":true');
    expect(event?.notProvenClaims).toEqual(
      expect.arrayContaining([
        "extension-execution",
        "plugin-execution",
        "tool-success",
        "terminal-success",
      ]),
    );
  });
});
