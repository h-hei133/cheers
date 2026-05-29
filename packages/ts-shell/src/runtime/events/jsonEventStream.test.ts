import { describe, expect, it } from "vitest";

import { projectSessionContextRebuild } from "../../context/sessionContextRebuildProjection.js";
import { createEvidenceOnlySavePoint } from "../../evidence/runtimeSavePoint.js";
import { projectSessionTree } from "../../session/sessionTreeProjection.js";
import { createRuntimeTurnSnapshot } from "../../turn/turnSnapshot.js";
import { createCommandExecutionReceipt } from "../execution/executionReceipt.js";
import { applyExtensionHookPolicy } from "../extensions/lifecycle.js";
import { projectStaticResourceRegistry } from "../resources/staticResourceProjection.js";
import {
  projectJsonRuntimeEventStream,
  serializeJsonRuntimeEventStream,
} from "./jsonEventStream.js";
import {
  projectRuntimeEvents,
  type RuntimeProjectionEvent,
} from "./runtimeEventProjection.js";

describe("JSON runtime event stream projection", () => {
  it("serializes runtime event observations as JSON-safe ordered entries", () => {
    const turnSnapshot = createRuntimeTurnSnapshot({
      sessionId: "sess-stream",
      turn: 1,
      phase: "turn",
      workspaceRoot: "/workspace",
      providerOptIn: false,
    });
    const receipt = createCommandExecutionReceipt({
      request: {
        operationKind: "command.run",
        command: "sh",
        args: ["-c", "printf ok"],
        cwd: "/workspace",
        workspaceRoot: "/workspace",
        authority: {
          mode: "command-allowlisted",
          source: "tool-runtime-approval",
          reason: "test authority",
        },
        caller: "core-tool:bash",
        reason: "stream test",
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
      turnSnapshot,
      phase: "save_point",
      executionReceipts: [receipt],
      evidenceIds: ["verification:not-run"],
    });
    const resourceProjection = projectStaticResourceRegistry({
      descriptors: [
        {
          id: "resource.safe",
          kind: "extension-manifest",
          name: "Safe Extension Metadata",
          description: "Metadata only.",
          sourceType: "fixture",
          ownerDomain: "runtime/resources",
          visibility: "runtime",
          enabledByDefault: false,
          requiresOptIn: true,
          capabilitiesSummary: ["observe"],
          riskLevel: "medium",
          extensionManifest: {
            extensionId: "extension.safe",
            lifecycleEvents: ["session-started"],
            hookEffects: ["annotate-evidence"],
          },
          notProvenClaims: [],
        },
      ],
    });
    const hookOutcome = applyExtensionHookPolicy({
      descriptor: {
        hookId: "extension.safe.session.observe",
        extensionId: "extension.safe",
        eventKind: "session-started",
        ownerDomain: "runtime/extensions",
        allowedEffect: "annotate-evidence",
        riskLevel: "low",
        requiresOptIn: true,
        supported: false,
        executable: false,
        registrationMode: "static-internal",
        notProvenClaims: [],
      },
      requestedEffect: "annotate-evidence",
      evidenceAnnotations: ["hook:observed"],
    });
    const sessionProjection = projectSessionTree({
      session: {
        id: "sess-stream",
        projectRoot: "/workspace",
        createdAt: "2026-05-29T00:00:00.000Z",
        updatedAt: "2026-05-29T00:00:01.000Z",
        status: "active",
        turns: [
          {
            role: "user",
            content: "raw transcript should not appear",
            timestamp: "2026-05-29T00:00:01.000Z",
          },
        ],
      },
      compactions: [
        {
          id: "compact_stream",
          summary: "summary available",
          evidence: "observed",
        },
      ],
      branchSummaries: [
        {
          id: "branch_stream",
          sourceBranchIdentity: "sess-stream",
          summary: "branch summary available",
        },
      ],
    });
    const contextRebuildProjection = projectSessionContextRebuild({
      sessionProjection,
    });

    const events = projectRuntimeEvents({
      turnSnapshot,
      executionReceipts: [receipt],
      savePoint,
      resourceProjection,
      hookPolicyOutcomes: [hookOutcome],
      sessionProjection,
      contextRebuildProjection,
      resultFacts: {
        status: "completed",
        terminalClassification: "success",
        terminalReason: "completed",
        verdictSource: "result",
      },
    });
    const stream = projectJsonRuntimeEventStream({
      events,
      streamId: "sess-stream",
    });
    const parsed = JSON.parse(serializeJsonRuntimeEventStream(stream));

    expect(stream.map((entry) => entry.order)).toEqual(
      Array.from({ length: stream.length }, (_, index) => index + 1),
    );
    expect(stream.map((entry) => entry.eventType)).toEqual([
      "turn-snapshot-observed",
      "phase-observed",
      "execution-receipt-observed",
      "save-point-observed",
      "result-facts-observed",
      "terminal-verdict-observed",
      "resource-projection-observed",
      "extension-hook-policy-observed",
      "session-projection-observed",
      "session-active-path-projected",
      "session-branch-summary-observed",
      "session-compaction-observed",
      "session-context-rebuild-projected",
    ]);
    expect(parsed).toEqual(stream);
    expect(
      stream.every(
        (entry) => entry.truthfulness.terminalSuccessClaim === false,
      ),
    ).toBe(true);
    expect(JSON.stringify(stream)).not.toMatch(
      /raw transcript should not appear|summary available|branch summary available/i,
    );
  });

  it("sorts by source sequence while preserving source sequence metadata", () => {
    const shuffled: RuntimeProjectionEvent[] = [
      makeEvent(3, "phase-observed"),
      makeEvent(1, "turn-snapshot-observed"),
      makeEvent(2, "save-point-observed"),
    ];

    const stream = projectJsonRuntimeEventStream({ events: shuffled });

    expect(stream.map((entry) => entry.order)).toEqual([1, 2, 3]);
    expect(stream.map((entry) => entry.sourceSequence)).toEqual([1, 2, 3]);
    expect(stream.map((entry) => entry.eventType)).toEqual([
      "turn-snapshot-observed",
      "save-point-observed",
      "phase-observed",
    ]);
  });

  it("serializes PL005 tool result message events without exposing unsafe content", () => {
    const stream = projectJsonRuntimeEventStream({
      events: [
        {
          id: "event-tool-message",
          sequence: 1,
          type: "tool-result-message-prepared",
          facts: {
            messageId: "msg-1",
            safeContentSummary:
              "token=secret oldText=before newText=after /home/wang/.private-agents-real/provider.env",
            terminalSuccessClaim: false,
          },
          notProvenClaims: ["next-turn-success"],
          redaction: {
            status: "report-safe",
            excluded: [],
          },
        },
      ],
    });
    const serialized = JSON.stringify(stream);

    expect(stream[0]?.eventType).toBe("tool-result-message-prepared");
    expect(stream[0]?.truthfulness.terminalSuccessClaim).toBe(false);
    expect(stream[0]?.notProvenClaims).toContain("terminal-success");
    expect(serialized).not.toMatch(
      /token=secret|oldText=before|newText=after|private-agents-real/i,
    );
  });

  it("redacts unsafe facts and strips unsupported JSON values", () => {
    const stream = projectJsonRuntimeEventStream({
      streamId: "/home/wang/.private-agents-real/provider.env",
      events: [
        {
          id: "event-sk-1234567890",
          sequence: 1,
          type: "tool-result-observed",
          facts: {
            raw: "raw provider output: hidden reasoning token=secret oldText=before newText=after",
            commandOutput: "<html>unsafe file contents</html>",
            terminalSuccessClaim: true,
            dropped: undefined,
            fn: () => "not json",
            infinite: Number.POSITIVE_INFINITY,
          },
          notProvenClaims: ["tool-success"],
          redaction: {
            status: "report-safe",
            excluded: [],
          },
        },
      ],
    });
    const serialized = serializeJsonRuntimeEventStream(stream);

    expect(serialized).not.toMatch(
      /private-agents-real|sk-1234567890|hidden reasoning|token=secret|oldText=before|newText=after|unsafe file contents|not json/i,
    );
    expect(stream[0]?.facts).not.toHaveProperty("dropped");
    expect(stream[0]?.facts).not.toHaveProperty("fn");
    expect(stream[0]?.redaction.status).toBe("redacted");
    expect(stream[0]?.truthfulness.terminalSuccessClaim).toBe(false);
    expect(stream[0]?.notProvenClaims).toContain(
      "event-stream-terminal-success-claim",
    );
  });
});

function makeEvent(
  sequence: number,
  type: RuntimeProjectionEvent["type"],
): RuntimeProjectionEvent {
  return {
    id: `runtime-event-${sequence}`,
    sequence,
    type,
    facts: { terminalSuccessClaim: false },
    notProvenClaims: ["terminal-success"],
    redaction: {
      status: "report-safe",
      excluded: [],
    },
  };
}
