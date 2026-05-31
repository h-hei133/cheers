import { describe, expect, it } from "vitest";

import { createRuntimeTurnSnapshot } from "../turn/turnSnapshot.js";
import { createEvidenceOnlySavePoint } from "../evidence/savepoint/model.js";
import { projectSessionTree } from "../session/sessionTreeProjection.js";
import { prepareNextTurnBundle } from "../turn/nextTurnBundle.js";
import { projectSessionContextRebuild } from "./sessionContextRebuildProjection.js";
import { buildLoopContextRebuildInput } from "./rebuildInput.js";

describe("loop context rebuild input", () => {
  it("builds safe input from active path, bundle, save point, and handoff ids", () => {
    const sessionProjection = projectSessionTree({
      session: {
        id: "sess-context-input",
        projectRoot: "/workspace",
        createdAt: "2026-05-29T00:00:00.000Z",
        updatedAt: "2026-05-29T00:00:01.000Z",
        status: "active",
        turns: [{ role: "user", content: "raw transcript secret" }],
      },
    });
    const contextRebuildProjection = projectSessionContextRebuild({
      sessionProjection,
      optionalFacts: ["branch-summary-record"],
    });
    const snapshot = createRuntimeTurnSnapshot({
      sessionId: "sess-context-input",
      turn: 1,
      phase: "turn",
      workspaceRoot: "/workspace",
      providerOptIn: false,
    });
    const savePoint = createEvidenceOnlySavePoint({
      turnSnapshot: snapshot,
      phase: "save_point",
      evidenceIds: ["tool-result-batch:batch-a"],
    });
    const bundle = prepareNextTurnBundle({
      bundleId: "bundle-a",
      turnId: "sess-context-input:turn:1",
    });

    const rebuildInput = buildLoopContextRebuildInput({
      sessionProjection,
      contextRebuildProjection,
      nextTurnBundle: bundle,
      savePoint,
      providerMetadataIds: ["synthetic"],
      missingFacts: ["verification-handoff"],
    });

    expect(rebuildInput.activePathProjectionId).toContain(sessionProjection.activeLeafId);
    expect(rebuildInput.nextTurnBundleId).toBe("bundle-a");
    expect(rebuildInput.savePointId).toBe(savePoint.id);
    expect(rebuildInput.includedFactsSummary).toEqual(
      expect.arrayContaining(["nextTurnBundle=available", "savePoint=available"]),
    );
    expect(rebuildInput.excludedFactsSummary).toContain("raw-transcript-content");
    expect(rebuildInput.missingFacts).toEqual(
      expect.arrayContaining(["verification-handoff", "branch-summary-record"]),
    );
    expect(rebuildInput.terminalSuccessClaim).toBe(false);
  });

  it("redacts unsafe rebuild input references", () => {
    const sessionProjection = projectSessionTree({
      session: {
        id: "sess-redact-context",
        projectRoot: "/workspace",
        createdAt: "2026-05-29T00:00:00.000Z",
        updatedAt: "2026-05-29T00:00:01.000Z",
        status: "active",
        turns: [],
      },
    });
    const rebuildInput = buildLoopContextRebuildInput({
      sessionProjection,
      providerMetadataIds: [
        "provider.env=/home/wang/.private-agents-real/provider.env token=secret oldText=before newText=after",
      ],
    });
    const serialized = JSON.stringify(rebuildInput);

    expect(serialized).not.toMatch(
      /private-agents-real|token=secret|oldText=before|newText=after/i,
    );
    expect(rebuildInput.redaction.status).toBe("redacted");
  });
});
