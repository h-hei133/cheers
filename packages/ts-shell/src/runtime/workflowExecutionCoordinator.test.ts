import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

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

    const result = await runMvpIntegratedFlow({
      sessionId: "runtime_coordinator_read",
      prompt: "Read package.json first 2 lines",
      workspaceRoot,
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    expect(result.codingResult?.taskKind).toBe("read-file");
    expect(result.codingResult?.changedFiles).toEqual([]);
    expect(result.codingResult?.verification.status).toBe("not-requested");
    expect(result.finalOutput).toContain("workflow-coordinator");
  });
});
