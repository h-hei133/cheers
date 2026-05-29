import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { RuntimeEvidenceSavePoint } from "../evidence/runtimeSavePoint.js";
import type { RuntimeTurnSnapshot } from "../turn/turnSnapshot.js";
import { runMvpIntegratedFlow } from "./workflowExecutionCoordinator.js";

describe("workflowExecutionCoordinator", () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "workflow-execution-coordinator-"),
    );
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  it("runs the legacy-compatible read path without writes", async () => {
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({ name: "workflow-coordinator" }, null, 2),
      "utf8",
    );

    const snapshots: RuntimeTurnSnapshot[] = [];
    const savePoints: RuntimeEvidenceSavePoint[] = [];

    const result = await runMvpIntegratedFlow({
      sessionId: "runtime_coordinator_read",
      prompt: "Read package.json first 2 lines",
      workspaceRoot,
      maxTurns: 6,
      runtimeTurnBoundary: {
        onTurnSnapshot: (snapshot) => snapshots.push(snapshot),
        onEvidenceSavePoint: (savePoint) => savePoints.push(savePoint),
      },
    });

    expect(result.status).toBe("completed");
    expect(result.codingResult?.taskKind).toBe("read-file");
    expect(result.codingResult?.changedFiles).toEqual([]);
    expect(result.codingResult?.verification.status).toBe("not-requested");
    expect(result.finalOutput).toContain("workflow-coordinator");
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({
      sessionId: "runtime_coordinator_read",
      phase: "turn",
      provider: {
        mode: "synthetic",
        optIn: false,
      },
    });
    expect(savePoints).toHaveLength(1);
    expect(savePoints[0]).toMatchObject({
      phase: "save_point",
      turnSnapshotId: snapshots[0]?.id,
      resultProjectionStatus: "observed-not-verdict",
      terminalSuccessClaim: false,
    });
    expect(result.loopTrajectory).toBeDefined();
    expect(result.loopTrajectory?.turnIds).toEqual(["turn:2"]);
    expect(result.loopTrajectory?.snapshotIds).toEqual([snapshots[0]?.id]);
    expect(result.loopTrajectory?.savePointIds).toEqual([savePoints[0]?.id]);
    expect(result.loopTrajectory?.providerMetadataIds).toContain("synthetic");
    expect(result.loopTrajectory?.terminalSuccessClaim).toBe(false);
    expect(result.loopTrajectory?.finalObservedFacts).toMatchObject({
      loopState: "stopped",
      terminalSuccessClaim: false,
    });
    expect(result.loopTrajectory?.notProvenClaims).toEqual(
      expect.arrayContaining([
        "provider-success",
        "tool-success",
        "execution-success",
        "terminal-success",
      ]),
    );
    expect(
      result.loopTrajectory?.stages.find(
        (stage) => stage.category === "before-tool-policy",
      )?.observationStatus,
    ).toBe("not_proven");
    expect(result.loopTrajectory?.events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "loop-input-observed",
        "loop-provider-boundary-observed",
        "loop-save-point-observed",
        "loop-product-surface-projected",
      ]),
    );
    expect(result.loopTrajectory?.jsonEventStream.map((entry) => entry.order)).toEqual(
      Array.from(
        { length: result.loopTrajectory?.jsonEventStream.length ?? 0 },
        (_, index) => index + 1,
      ),
    );
    expect(
      result.loopTrajectory?.jsonEventStream.every(
        (entry) => entry.truthfulness.terminalSuccessClaim === false,
      ),
    ).toBe(true);
  });

  it("attaches execution receipts without upgrading command success", async () => {
    const result = await runMvpIntegratedFlow({
      sessionId: "runtime_coordinator_command",
      prompt: "Run node --version",
      workspaceRoot,
      escalationDecision: "allow-once",
      maxTurns: 6,
    });

    expect(result.codingResult?.taskKind).toBe("run-command");
    expect(result.codingResult?.verification.status).toBe("passed");
    expect(result.loopTrajectory?.receiptIds.length).toBeGreaterThan(0);
    expect(
      result.loopTrajectory?.events.some(
        (event) => event.type === "loop-execution-receipt-observed",
      ),
    ).toBe(true);
    expect(
      result.loopTrajectory?.notProvenClaims,
    ).toEqual(expect.arrayContaining(["execution-success", "terminal-success"]));
    expect(result.loopTrajectory?.terminalSuccessClaim).toBe(false);
  }, 15000);

  it("redacts unsafe prompt and provider labels in product-path observations", async () => {
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({ name: "redaction-workspace" }, null, 2),
      "utf8",
    );

    const result = await runMvpIntegratedFlow({
      sessionId: "runtime_coordinator_redaction",
      prompt:
        "Read package.json first 1 line with token=sk-1234567890 and oldText=SECRET",
      workspaceRoot,
      providerMode: "real",
      realProvider: {
        provider: "openai-compatible",
        apiKey: "sk-not-serialized-123456789",
        model: "/home/wang/.private-agents-real/model-secret",
      },
      maxTurns: 6,
    });

    const serialized = JSON.stringify(result.loopTrajectory);
    expect(serialized).not.toContain("sk-1234567890");
    expect(serialized).not.toContain("sk-not-serialized");
    expect(serialized).not.toContain("/home/wang/.private-agents-real");
    expect(serialized).not.toContain("oldText=SECRET");
    expect(result.loopTrajectory?.redaction.status).toBe("redacted");
    expect(result.loopTrajectory?.providerMetadataIds).toContain(
      "openai-compatible",
    );
    expect(result.loopTrajectory?.notProvenClaims).toEqual(
      expect.arrayContaining([
        "provider-called",
        "provider-success",
        "auth-secret-available",
        "terminal-success",
      ]),
    );
  });
});
