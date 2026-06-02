import { describe, expect, it } from "vitest";

import { buildLoopContextRebuildInput } from "../../context/rebuildInput.js";
import { projectSessionContextRebuild } from "../../context/sessionContextRebuildProjection.js";
import { projectProviderRegistry, unknownProviderCompatibilityFlags } from "../../provider/registry/provider.js";
import { projectProductSurfaceViewModel } from "../../presentation/surface/model.js";
import { renderSessionStatusEnvelope } from "../../presentation/terminal/renderer.js";
import { evaluateContinuationReadiness } from "../../session/continuation/readiness.js";
import { projectSessionStatusEnvelope } from "../../session/presentation/envelope.js";
import { summarizeReplaySafeLoopState } from "../../session/replay/state.js";
import type { Session } from "../../session/schema/sessionRecord.js";
import {
  addSessionCompactionRecord,
  appendSessionThreadChild,
  buildLinearSessionThreadSnapshot,
  createSessionBranch,
  switchSessionActiveLeaf,
  type SessionThreadSnapshot,
} from "../../session/schema/sessionThread.js";
import { projectSessionTree } from "../../session/sessionTreeProjection.js";
import { projectRuntimeEvents } from "../events/projection.js";
import { runAgentLoopContract } from "./contract.js";
import { createSyntheticModelBoundary } from "./providerBoundary.js";

describe("session branch and compaction runtime continuity", () => {
  it("continues a resumed safe active leaf through request preparation without terminal success", async () => {
    const session = makeSession("sess_resume");
    const thread = withSafeCompaction(
      appendSessionThreadChild({
        snapshot: buildLinearSessionThreadSnapshot(session),
        session,
        messageRole: "assistant",
        timestamp: "2026-06-02T00:00:02.000Z",
        entryId: "sess_resume:turn-2",
        parentEntryId: "sess_resume:turn-1",
      }),
      "compact-resume",
    );
    const lane = await projectLane({ session, thread });

    expect(lane.sessionProjection).toMatchObject({
      treeSupport: "branching",
      branchSupport: "storage-backed",
      activeLeafId: "sess_resume:turn-2",
      terminal: { terminalSuccessClaim: false },
    });
    expect(lane.contextRebuildProjection.availableContext).toEqual(
      expect.arrayContaining(["retained-context:1", "excluded-context:1"]),
    );
    expect(lane.continuationReadiness.status).toBe("ready");
    expect(lane.requestPreparation?.safeRequestMessages.map((message) => message.safeSummary).join("\n"))
      .toContain("branch:storage_backed");
    expect(lane.replaySummary).toMatchObject({
      branchSupport: "storage-backed",
      compactionStatus: "storage-backed",
      retainedContextFactIds: ["retained:compact-resume"],
      terminalSuccessClaim: false,
    });
    expect(lane.renderedStatus).toContain("[branch] Session:");
    expect(lane.renderedStatus).toContain("[compaction] Session:");
    expect(lane.renderedStatus).not.toContain("Outcome: success");
    expect(lane.loop.terminalSuccessClaim).toBe(false);
  });

  it("uses the switched branch leaf for replay, context rebuild, surface, and status", async () => {
    const session = makeSession("sess_branch");
    const root = buildLinearSessionThreadSnapshot(session);
    const branchChild = appendSessionThreadChild({
      snapshot: root,
      session,
      messageRole: "assistant",
      timestamp: "2026-06-02T00:00:03.000Z",
      entryId: "sess_branch:turn-branch",
      parentEntryId: "sess_branch:turn-1",
    });
    const branch = createSessionBranch({
      snapshot: branchChild,
      sessionId: session.id,
      parentEntryId: "sess_branch:turn-1",
      leafEntryId: "sess_branch:turn-branch",
      branchId: "branch:alternate",
      createdAt: "2026-06-02T00:00:04.000Z",
      switchReason: "select alternate safe leaf",
    });
    const switched = withSafeCompaction(
      switchSessionActiveLeaf({
        snapshot: branch,
        leafEntryId: "sess_branch:turn-branch",
        branchId: "branch:alternate",
      }),
      "compact-branch",
    );
    const lane = await projectLane({ session, thread: switched });

    expect(lane.sessionProjection.activePath).toEqual([
      "sess_branch:root",
      "sess_branch:turn-1",
      "sess_branch:turn-branch",
    ]);
    expect(lane.sessionProjection.branchFacts.branchIds).toEqual(["branch:alternate"]);
    expect(lane.contextRebuildProjection.rebuildSource.activeLeafId).toBe("sess_branch:turn-branch");
    expect(lane.replaySummary.activeBranchId).toBe("branch:alternate");
    expect(lane.surface?.sections.find((section) => section.title === "Session")?.summary)
      .toContain("activeLeaf=resolved");
    expect(lane.envelope.sessionBranch.summary).toContain("activeBranch=branch:alternate");
    expect(lane.envelope.terminalSuccessClaim).toBe(false);
  });

  it("blocks continuation and request preparation when compaction facts are stale, unsafe, unsupported, or missing", async () => {
    const session = makeSession("sess_blocked");
    const thread = addSessionCompactionRecord({
      snapshot: buildLinearSessionThreadSnapshot(session),
      record: {
        compactionId: "compact-blocked",
        sourceActivePath: ["sess_blocked:root", "sess_blocked:turn-1"],
        retainedEntryIds: [],
        excludedEntryIds: ["sess_blocked:turn-1"],
        retainedContextFacts: [],
        excludedContextFacts: [{ factId: "excluded:unsafe", status: "unsafe" }],
        staleInputIds: ["stale-context"],
        unsafeInputIds: ["unsafe-context"],
        missingFactIds: ["missing-summary"],
        unsupportedFactIds: ["unsupported-format"],
        summaryAvailability: "missing",
        summaryProvenance: "missing",
        createdAt: "2026-06-02T00:00:05.000Z",
      },
    });
    const lane = await projectLane({ session, thread });

    expect(lane.contextRebuildProjection.staleFacts).toContain("stale-context");
    expect(lane.contextRebuildProjection.missingFacts).toEqual(
      expect.arrayContaining(["missing-summary", "unsafe-context"]),
    );
    expect(lane.continuationReadiness.status).toBe("blocked_missing_required_facts");
    expect(lane.continuationReadiness.missingRequiredFacts).toEqual(
      expect.arrayContaining(["missing-summary", "unsupported-format"]),
    );
    expect(lane.continuationReadiness.unsafeFactsExcluded).toEqual(
      expect.arrayContaining(["unsafe-context", "excluded:unsafe"]),
    );
    expect(lane.requestPreparation?.readinessStatus).toBe("blocked_by_missing_context");
    expect(lane.requestPreparation?.blockedReasons).toEqual(
      expect.arrayContaining([
        "continuation:blocked_missing_required_facts",
        "continuation-context:blocked_stale_context",
      ]),
    );
    expect(lane.replaySummary.compactionBlockedReasons).toEqual(
      expect.arrayContaining([
        "compaction-stale:stale-context",
        "compaction-unsafe:unsafe-context",
        "compaction-missing:missing-summary",
        "compaction-unsupported:unsupported-format",
      ]),
    );
    expect(lane.envelope.sessionCompaction.status).toBe("storage-backed");
    expect(lane.loop.terminalSuccessClaim).toBe(false);
  });
});

async function projectLane(input: {
  readonly session: Session;
  readonly thread: SessionThreadSnapshot;
}) {
  const sessionProjection = projectSessionTree({
    session: input.session,
    stateSnapshot: {
      status: input.session.status,
      projectRoot: input.session.projectRoot,
      thread: input.thread,
    },
  });
  const contextRebuildProjection = projectSessionContextRebuild({
    sessionProjection,
  });
  const contextRebuildInput = buildLoopContextRebuildInput({
    sessionProjection,
    contextRebuildProjection,
  });
  const continuationReadiness = evaluateContinuationReadiness({
    sessionProjection,
    contextRebuildProjection,
    rebuildInput: contextRebuildInput,
  });
  const loop = await runAgentLoopContract({
    sessionId: input.session.id,
    workspaceRoot: input.session.projectRoot,
    prompt: "resume safely",
    providerOptIn: true,
    providerMode: "synthetic",
    providerId: "synthetic-provider",
    modelLabel: "Fixture model",
    maxTurns: 1,
    providerRegistry: providerRegistry(),
    sessionProjection,
    contextRebuildProjection,
    contextRebuildInput,
    continuationReadiness,
    modelBoundary: createSyntheticModelBoundary({
      program: {
        steps: [{
          kind: "completed",
          response: {
            content: "safe continuation response",
            finishReason: "stop",
          },
        }],
      },
    }),
  });
  const turn = loop.turns[0];
  const requestPreparation = turn?.nextTurn.requestPreparation;
  const replaySummary = summarizeReplaySafeLoopState({
    sessionProjection,
    contextRebuildProjection,
    continuationReadiness,
    rebuildInput: contextRebuildInput,
    requestPreparation,
    terminalResultFacts: {
      status: "stopped_error",
      terminalClassification: "stopped",
      terminalReason: "stopped_error",
    },
  });
  const runtimeEvents = projectRuntimeEvents({
    sessionProjection,
    contextRebuildProjection,
    contextRebuildInputs: [contextRebuildInput],
    continuationReadiness: [continuationReadiness],
    nextTurnRequestPreparations: requestPreparation ? [requestPreparation] : [],
    replaySafeLoopStateSummaries: [replaySummary],
  });
  const surface = projectProductSurfaceViewModel({
    status: "stopped_error",
    terminalClassification: "stopped",
    terminalReason: "stopped_error",
    runtimeEvents,
    sessionProjection,
  });
  if (!surface) {
    throw new Error("surface missing");
  }
  const envelope = projectSessionStatusEnvelope(surface);
  const renderedStatus = renderSessionStatusEnvelope(envelope, { mode: "detailed" }).lines.join("\n");
  return {
    sessionProjection,
    contextRebuildProjection,
    contextRebuildInput,
    continuationReadiness,
    loop,
    requestPreparation,
    replaySummary,
    runtimeEvents,
    surface,
    envelope,
    renderedStatus,
  };
}

function withSafeCompaction(
  snapshot: SessionThreadSnapshot,
  compactionId: string,
): SessionThreadSnapshot {
  const activeLeafId = snapshot.activeLeafId ?? snapshot.entries.at(-1)?.id ?? "missing-active-leaf";
  const rootId = snapshot.entries.find((entry) => entry.kind === "session-root")?.id ?? "missing-root";
  return addSessionCompactionRecord({
    snapshot,
    record: {
      compactionId,
      sourceActivePath: [rootId, activeLeafId],
      retainedEntryIds: [activeLeafId],
      excludedEntryIds: ["excluded-prior-turn"],
      retainedContextFacts: [{ factId: `retained:${compactionId}`, status: "safe" }],
      excludedContextFacts: [{ factId: `excluded:${compactionId}`, status: "unsafe" }],
      staleInputIds: [],
      unsafeInputIds: [],
      missingFactIds: [],
      unsupportedFactIds: [],
      firstRetainedEntryId: activeLeafId,
      summaryAvailability: "available",
      summaryProvenance: "synthetic-fixture",
      createdAt: "2026-06-02T00:00:05.000Z",
      tokenMetadata: { tokensBefore: 1200 },
    },
  });
}

function makeSession(id: string): Session {
  return {
    id,
    projectRoot: "/workspace",
    createdAt: "2026-06-02T00:00:00.000Z",
    updatedAt: "2026-06-02T00:00:01.000Z",
    status: "active",
    turns: [{
      role: "user",
      content: "raw transcript stays excluded",
      timestamp: "2026-06-02T00:00:01.000Z",
    }],
  };
}

function providerRegistry() {
  return projectProviderRegistry({
    providers: [{
      providerId: "synthetic-provider",
      safeLabel: "Synthetic provider",
      providerKind: "custom",
      endpointClass: "unknown",
      authMode: "none",
      defaultEnabled: false,
      requiresExplicitOptIn: true,
      supportsFallback: "unknown",
      compatibility: unknownProviderCompatibilityFlags(),
      riskLevel: "low",
    }],
    models: [{
      modelId: "fixture-model",
      safeLabel: "Fixture model",
      providerId: "synthetic-provider",
      family: "fixture",
      compatibility: unknownProviderCompatibilityFlags(),
      knownLimitations: [],
    }],
    auth: [{
      providerId: "synthetic-provider",
      authSourceKind: "none",
      authMode: "none",
      resolutionStatus: "resolved",
    }],
  });
}
