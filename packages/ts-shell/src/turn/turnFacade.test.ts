import { describe, expect, it } from "vitest";

import {
  projectProductTurnResultHandoff,
  runProductTurn,
  streamProductTurn,
} from "./turnFacade.js";
import { createEvidenceOnlySavePoint } from "../evidence/savepoint/model.js";
import type { OrchestrationResult } from "../orchestration/types.js";
import { createRuntimeTurnSnapshot } from "./turnSnapshot.js";

describe("turnFacade", () => {
  it("wraps the legacy integrated flow without changing its result", async () => {
    const result = orchestrationResult({
      status: "completed",
      terminalClassification: "success",
      terminalReason: "completed",
    });

    const turn = await runProductTurn(
      {
        sessionId: "sess-turn",
        prompt: "read src/app.ts",
        workspaceRoot: "/tmp/workspace",
        providerMode: "synthetic",
        agentMode: "plan",
      },
      {
        runIntegratedFlow: async () => result,
      },
    );

    expect(turn.result).toBe(result);
    expect(turn.capabilityDecision).toMatchObject({
      source: "legacy-integrated-flow",
      executionEntrypoint: "runMvpIntegratedFlow",
    });
    expect(turn.handoff).toMatchObject({
      status: "completed",
      terminalClassification: "success",
      resultSessionCliSuccessUpgrade: false,
    });
    expect(turn.runtimeBoundary).toEqual({
      snapshots: [],
      savePoints: [],
    });
  });

  it("collects runtime boundary snapshot and save-point projections without changing terminal truth", async () => {
    const result = orchestrationResult({
      status: "stopped_error",
      terminalClassification: "stopped",
      terminalReason: "stopped_error",
      evidence: ["verification:not-run"],
    });
    const turn = await runProductTurn(
      {
        sessionId: "sess-boundary",
        prompt: "edit file",
        workspaceRoot: "/tmp/workspace",
      },
      {
        runIntegratedFlow: async (input) => {
          const snapshot = createRuntimeTurnSnapshot({
            sessionId: input.sessionId,
            turn: 1,
            phase: "turn",
            workspaceRoot: input.workspaceRoot,
            providerOptIn: false,
          });
          input.runtimeTurnBoundary?.onTurnSnapshot?.(snapshot);
          input.runtimeTurnBoundary?.onEvidenceSavePoint?.(
            createEvidenceOnlySavePoint({
              turnSnapshot: snapshot,
              phase: "save_point",
              evidenceIds: ["verification:not-run"],
              resultProjection: {
                status: "insufficient-evidence",
                terminalClassification: "stopped",
                terminalReason: "stopped_error",
              },
            }),
          );
          return result;
        },
      },
    );

    expect(turn.result).toBe(result);
    expect(turn.handoff.terminalClassification).toBe("stopped");
    expect(turn.handoff.resultSessionCliSuccessUpgrade).toBe(false);
    expect(turn.runtimeBoundary.snapshots).toHaveLength(1);
    expect(turn.runtimeBoundary.savePoints).toHaveLength(1);
    expect(turn.runtimeBoundary.savePoints[0]?.terminalSuccessClaim).toBe(false);
  });

  it("preserves stopped and partial handoff facts instead of creating success", () => {
    const handoff = projectProductTurnResultHandoff(orchestrationResult({
      status: "stopped_error",
      terminalClassification: "stopped",
      terminalReason: "stopped_error",
      changedFiles: ["src/a.ts"],
      failedFiles: [{ path: "src/b.ts", reason: "verification failed" }],
      unverifiedFiles: [{ path: "src/a.ts", reason: "verification not run" }],
      evidence: ["apply:partial", "verification:not-run"],
    }));

    expect(handoff.status).toBe("stopped_error");
    expect(handoff.terminalClassification).toBe("stopped");
    expect(handoff.changedFiles).toEqual(["src/a.ts"]);
    expect(handoff.failedFiles).toEqual(["src/b.ts"]);
    expect(handoff.resultSessionCliSuccessUpgrade).toBe(false);
  });

  it("streams through the compatibility entrypoint unchanged", async () => {
    const events = [{ type: "assistant_delta", text: "ok" }] as const;
    const streamed: unknown[] = [];

    for await (const event of streamProductTurn(
      {
        sessionId: "sess-stream",
        prompt: "hello",
        workspaceRoot: "/tmp/workspace",
        maxTurns: 1,
      },
      {
        streamIntegratedFlow: async function* () {
          yield* events;
        },
      },
    )) {
      streamed.push(event);
    }

    expect(streamed).toEqual(events);
  });
});

function orchestrationResult(input: {
  readonly status: OrchestrationResult["status"];
  readonly terminalClassification: OrchestrationResult["terminalClassification"];
  readonly terminalReason: OrchestrationResult["terminalReason"];
  readonly changedFiles?: readonly string[];
  readonly failedFiles?: Array<{ path: string; reason: string }>;
  readonly verifiedFiles?: readonly string[];
  readonly unverifiedFiles?: Array<{ path: string; reason: string }>;
  readonly evidence?: readonly string[];
}): OrchestrationResult {
  return {
    status: input.status,
    terminalClassification: input.terminalClassification,
    terminalReason: input.terminalReason,
    finalOutput: "test output",
    transcript: [],
    sharedContext: {
      sessionId: "sess-turn",
      initialPrompt: "prompt",
      notes: [],
      handoffs: [],
    },
    codingResult: {
      taskKind: "edit-file",
      changedFiles: [...(input.changedFiles ?? [])],
      failedFiles: [...(input.failedFiles ?? [])],
      patches: [],
      verifiedFiles: [...(input.verifiedFiles ?? [])],
      unverifiedFiles: [...(input.unverifiedFiles ?? [])],
      verification: { status: "skipped" },
      repair: {
        status: "not-needed",
        attempts: 0,
        recoveredItems: [],
        failedItems: [],
        notes: [],
      },
      continuation: {
        status: "failed-after-bounded-continuation",
        attempts: 0,
        evidence: [],
      },
      evidence: [...(input.evidence ?? [])],
    },
  };
}
