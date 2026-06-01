import { describe, expect, it } from "vitest";

import { projectSessionContextRebuild } from "../../context/sessionContextRebuildProjection.js";
import { createEvidenceOnlySavePoint } from "../../evidence/savepoint/model.js";
import { projectSessionTree } from "../../session/sessionTreeProjection.js";
import { createRuntimeTurnSnapshot } from "../../turn/turnSnapshot.js";
import { createCommandExecutionReceipt } from "../execution/receipt.js";
import { applyExtensionHookPolicy } from "../extensions/lifecycle.js";
import { projectStaticResourceRegistry } from "../resources/projection.js";
import {
  projectJsonRuntimeEventStream,
  serializeJsonRuntimeEventStream,
} from "./stream.js";
import {
  projectRuntimeEvents,
  type RuntimeProjectionEvent,
} from "./projection.js";

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
      "tool-execution-receipt-observed",
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

  it("serializes product loop adapter observations as observation-only JSON", () => {
    const stream = projectJsonRuntimeEventStream({
      events: [
        {
          id: "event-adapter",
          sequence: 1,
          type: "product-loop-adapter-observed",
          facts: {
            adapterId: "adapter-stream",
            featureContractAvailable: true,
            unsupportedPhaseIds: ["storage-backed-branching"],
            terminalSuccessClaim: false,
          },
          notProvenClaims: [
            "adapter-observed-is-not-success",
            "feature-contract-valid-is-not-success",
          ],
          redaction: {
            status: "report-safe",
            excluded: [],
          },
        },
      ],
    });

    expect(stream[0]).toMatchObject({
      eventType: "product-loop-adapter-observed",
      truthfulness: {
        observationOnly: true,
        terminalSuccessClaim: false,
      },
    });
    expect(stream[0]?.notProvenClaims).toEqual(
      expect.arrayContaining([
        "adapter-observed-is-not-success",
        "feature-contract-valid-is-not-success",
        "terminal-success",
      ]),
    );
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

  it("serializes PL006 next-turn delivery observations without success claims", () => {
    const stream = projectJsonRuntimeEventStream({
      events: [
        {
          id: "event-next-turn",
          sequence: 1,
          type: "next-turn-bundle-prepared",
          facts: {
            bundleId: "bundle-a",
            deliveryStatus: "waiting",
            safeSummary:
              "raw provider output: hidden reasoning token=secret oldText=before newText=after",
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

    expect(stream[0]?.eventType).toBe("next-turn-bundle-prepared");
    expect(stream[0]?.truthfulness.terminalSuccessClaim).toBe(false);
    expect(stream[0]?.notProvenClaims).toContain("terminal-success");
    expect(serialized).not.toMatch(
      /raw provider output|hidden reasoning|token=secret|oldText=before|newText=after/i,
    );
  });

  it("serializes model invocation gate observations without success claims", () => {
    const stream = projectJsonRuntimeEventStream({
      events: [
        {
          id: "event-model-invocation",
          sequence: 1,
          type: "model-invocation-attempt-prepared",
          facts: {
            attemptId: "attempt-a",
            attemptStatus: "blocked",
            retryEligibility: "retry_metadata_unavailable",
            fallbackEligibility: "fallback_metadata_unavailable",
            unsafe:
              "provider.env=/home/wang/.private-agents-real/provider.env raw provider output hidden reasoning token=secret oldText=before newText=after",
            terminalSuccessClaim: false,
          },
          notProvenClaims: [
            "invocation-attempted-is-not-provider-success",
            "provider-completed-is-not-task-success",
          ],
          redaction: {
            status: "report-safe",
            excluded: [],
          },
        },
      ],
    });
    const serialized = serializeJsonRuntimeEventStream(stream);

    expect(stream[0]?.eventType).toBe("model-invocation-attempt-prepared");
    expect(stream[0]?.truthfulness.terminalSuccessClaim).toBe(false);
    expect(stream[0]?.notProvenClaims).toContain("terminal-success");
    expect(serialized).not.toMatch(
      /private-agents-real|raw provider output|hidden reasoning|token=secret|oldText=before|newText=after/i,
    );
  });

  it("serializes controlled invocation observations without success claims", () => {
    const stream = projectJsonRuntimeEventStream({
      events: [
        {
          id: "event-controlled-invocation",
          sequence: 1,
          type: "provider-response-handoff-prepared",
          facts: {
            responseHandoffId: "handoff-a",
            responseClassification: "completed",
            toolCallExtractionReadiness: "ready",
            raw:
              "provider.env=/home/wang/.private-agents-real/provider.env raw provider output hidden reasoning token=secret oldText=before newText=after",
            terminalSuccessClaim: false,
          },
          notProvenClaims: [
            "response-handoff-is-not-final-assistant-success",
            "tool-extraction-readiness-is-not-tool-execution",
          ],
          redaction: {
            status: "report-safe",
            excluded: [],
          },
        },
      ],
    });
    const serialized = serializeJsonRuntimeEventStream(stream);

    expect(stream[0]?.eventType).toBe("provider-response-handoff-prepared");
    expect(stream[0]?.truthfulness.terminalSuccessClaim).toBe(false);
    expect(stream[0]?.notProvenClaims).toContain("terminal-success");
    expect(serialized).not.toMatch(
      /private-agents-real|raw provider output|hidden reasoning|token=secret|oldText=before|newText=after/i,
    );
  });

  it("serializes PL007 verification and repair observations without success claims", () => {
    const stream = projectJsonRuntimeEventStream({
      events: [
        {
          id: "event-repair-proposal",
          sequence: 1,
          type: "repair-proposal-observed",
          facts: {
            proposalId: "proposal-1",
            sourceVerificationId: "verification-1",
            originalFailureClass: "test-failed",
            originalFailureSummary: "verification failed",
            taskRelevanceStatus: "task_relevant",
            coverageStatus: "covered",
            runtimeReceiptIds: ["receipt-repair-stream"],
            readinessStatus: "partial",
            applyStatus: "not_applied",
            postRepairVerificationStatus: "not_run",
            raw:
              "raw provider output: hidden reasoning token=secret oldText=before newText=after",
            terminalSuccessClaim: false,
          },
          notProvenClaims: [
            "repair-success",
            "verification-success",
            "repair-proposal-is-not-apply",
            "post-repair-verification-not-run-is-not-success",
          ],
          redaction: {
            status: "report-safe",
            excluded: [],
          },
        },
      ],
    });
    const serialized = JSON.stringify(stream);

    expect(stream[0]?.eventType).toBe("repair-proposal-observed");
    expect(stream[0]?.facts).toEqual(
      expect.objectContaining({
        originalFailureClass: "test-failed",
        runtimeReceiptIds: ["receipt-repair-stream"],
        applyStatus: "not_applied",
        postRepairVerificationStatus: "not_run",
      }),
    );
    expect(stream[0]?.truthfulness.terminalSuccessClaim).toBe(false);
    expect(stream[0]?.notProvenClaims).toContain("terminal-success");
    expect(serialized).not.toMatch(
      /raw provider output|hidden reasoning|token=secret|oldText=before|newText=after/i,
    );
  });

  it("serializes verification boundary receipt facts as observation only", () => {
    const stream = projectJsonRuntimeEventStream({
      events: [
        {
          id: "event-verification-boundary",
          sequence: 1,
          type: "verification-result-observed",
          facts: {
            verificationId: "verification-1",
            status: "passed",
            relevanceStatus: "task_relevant",
            coverageStatus: "covered",
            authorityRequirement: "granted",
            runtimeReceiptIds: ["receipt-1"],
            repairEligible: false,
            commandExitZeroIsTaskSuccess: false,
            terminalSuccessClaim: false,
          },
          notProvenClaims: ["task-success", "verification-success"],
          redaction: {
            status: "report-safe",
            excluded: [],
          },
        },
      ],
    });

    expect(stream[0]?.facts).toEqual(
      expect.objectContaining({
        runtimeReceiptIds: ["receipt-1"],
        repairEligible: false,
        commandExitZeroIsTaskSuccess: false,
      }),
    );
    expect(stream[0]?.truthfulness.observationOnly).toBe(true);
    expect(stream[0]?.truthfulness.terminalSuccessClaim).toBe(false);
    expect(stream[0]?.notProvenClaims).toContain("terminal-success");
  });

  it("serializes PL008 continuation observations without unsafe context or success claims", () => {
    const stream = projectJsonRuntimeEventStream({
      events: [
        {
          id: "event-pl008",
          sequence: 1,
          type: "context-rebuild-input-prepared",
          facts: {
            rebuildInputId: "context-rebuild-input-1",
            missingFacts: ["branch-summary-record"],
            unsafe:
              "provider.env=/home/wang/.private-agents-real/provider.env raw provider output hidden reasoning token=secret oldText=before newText=after",
            terminalSuccessClaim: true,
          },
          notProvenClaims: [
            "context-rebuild-input-is-not-success",
            "continuation-ready-is-not-success",
          ],
          redaction: {
            status: "report-safe",
            excluded: [],
          },
        },
      ],
    });
    const serialized = serializeJsonRuntimeEventStream(stream);

    expect(stream[0]?.eventType).toBe("context-rebuild-input-prepared");
    expect(stream[0]?.truthfulness.terminalSuccessClaim).toBe(false);
    expect(stream[0]?.notProvenClaims).toContain("terminal-success");
    expect(serialized).not.toMatch(
      /private-agents-real|raw provider output|hidden reasoning|token=secret|oldText=before|newText=after/i,
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

  it("keeps response reentry cycle stream entries observation-only", () => {
    const stream = projectJsonRuntimeEventStream({
      events: [
        {
          id: "event-reentry",
          sequence: 1,
          type: "response-reentry-observed",
          facts: {
            reentryId: "reentry-a",
            reentryStatus: "processed",
            raw: "raw provider output: hidden reasoning token=secret",
            terminalSuccessClaim: true,
          },
          notProvenClaims: ["reentry-processed-is-not-task-success"],
          redaction: {
            status: "report-safe",
            excluded: [],
          },
        },
        {
          id: "event-cycle",
          sequence: 2,
          type: "loop-cycle-boundary-observed",
          facts: {
            cycleId: "cycle-a",
            cycleStatus: "tool_handoff_ready",
            terminalSuccessClaim: true,
          },
          notProvenClaims: ["cycle-boundary-is-not-terminal-success"],
          redaction: {
            status: "report-safe",
            excluded: [],
          },
        },
      ],
    });
    const serialized = serializeJsonRuntimeEventStream(stream);

    expect(stream.map((entry) => entry.eventType)).toEqual([
      "response-reentry-observed",
      "loop-cycle-boundary-observed",
    ]);
    expect(stream.every((entry) => entry.truthfulness.terminalSuccessClaim === false)).toBe(true);
    expect(stream.flatMap((entry) => entry.notProvenClaims)).toEqual(
      expect.arrayContaining([
        "reentry-processed-is-not-task-success",
        "cycle-boundary-is-not-terminal-success",
        "event-stream-terminal-success-claim",
      ]),
    );
    expect(serialized).not.toMatch(/raw provider output|hidden reasoning|token=secret/i);
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
