import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { safeRemoveDir } from "../test-utils/cleanup.js";
import {
  runMvpIntegratedFlow,
  streamMvpIntegratedFlow,
} from "./runMvpIntegratedFlow.js";

describe("fenced edit runtime activation", () => {
  let workspaceRoot = "";

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "private-agents-fenced-runtime-"),
    );
  });

  afterEach(async () => {
    await safeRemoveDir(workspaceRoot);
  });

  it("reaches the Route 167 lane from a normal integrated prompt", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "src", "app.ts"),
      "title\nstatus: draft\nfooter\n",
      "utf8",
    );

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_fenced_runtime_success",
      prompt: [
        "Replace the exact fenced block in src/app.ts",
        "```",
        "status: draft",
        "```",
        "with",
        "```",
        "status: ready",
        "```",
      ].join("\n"),
      workspaceRoot,
      escalationDecision: "allow-once",
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    expect(result.codingResult?.changedFiles).toEqual(["src/app.ts"]);
    expect(result.codingResult?.evidence).toEqual(
      expect.arrayContaining([
        "fenced-edit-activation:selected",
        "fenced-edit-route:exact-replacement-written",
        "apply-patch-workspace-write-route:final-stale-read-immediately-before-writer",
        "apply-patch-workspace-write-route:post-write-verification-passed",
      ]),
    );
    expect(result.codingResult?.continuation.evidence).toContain(
      "fenced-edit-result:operation:fenced-replacement",
    );
  });

  it("keeps unsupported and ambiguous activated prompts stopped before writing", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "src", "app.ts"),
      "status: draft\nstatus: draft\n",
      "utf8",
    );

    const fuzzy = await runMvpIntegratedFlow({
      sessionId: "sess_fenced_runtime_fuzzy",
      prompt:
        "Replace the similar fenced block in src/app.ts with the closest new version.",
      workspaceRoot,
      escalationDecision: "allow-once",
      maxTurns: 6,
    });
    expect(fuzzy.status).toBe("stopped_error");
    expect(fuzzy.codingResult?.changedFiles).toEqual([]);
    expect(fuzzy.codingResult?.evidence).toContain(
      "fenced-edit-activation:blocker:unsupported-fuzzy",
    );

    const multiple = await runMvpIntegratedFlow({
      sessionId: "sess_fenced_runtime_multiple",
      prompt: [
        "Replace the exact fenced block in src/app.ts",
        "```",
        "status: draft",
        "```",
        "with",
        "```",
        "status: ready",
        "```",
      ].join("\n"),
      workspaceRoot,
      escalationDecision: "allow-once",
      maxTurns: 6,
    });
    expect(multiple.status).toBe("stopped_error");
    expect(multiple.codingResult?.changedFiles).toEqual([]);
    expect(multiple.codingResult?.evidence).toContain(
      "fenced-edit-plan:blocker:multiple-matches",
    );
  });

  it("stops missing target and missing mapping through the activated runtime path", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "src", "app.ts"),
      "status: draft\n",
      "utf8",
    );

    const missingTarget = await runMvpIntegratedFlow({
      sessionId: "sess_fenced_runtime_missing_target",
      prompt: [
        "Replace the exact fenced block",
        "```",
        "status: draft",
        "```",
        "with",
        "```",
        "status: ready",
        "```",
      ].join("\n"),
      workspaceRoot,
      escalationDecision: "allow-once",
      maxTurns: 6,
    });
    expect(missingTarget.status).toBe("stopped_error");
    expect(missingTarget.codingResult?.changedFiles).toEqual([]);
    expect(missingTarget.codingResult?.evidence).toContain(
      "fenced-edit-plan:blocker:missing-target",
    );

    const missingMapping = await runMvpIntegratedFlow({
      sessionId: "sess_fenced_runtime_missing_mapping",
      prompt: "Replace the fenced block in src/app.ts.",
      workspaceRoot,
      escalationDecision: "allow-once",
      maxTurns: 6,
    });
    expect(missingMapping.status).toBe("stopped_error");
    expect(missingMapping.codingResult?.changedFiles).toEqual([]);
    expect(missingMapping.codingResult?.evidence).toContain(
      "fenced-edit-plan:blocker:missing-mapping",
    );
  });

  it("streams success and stopped fenced replacement results for CLI print consumers", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "src", "stream.ts"),
      "status: draft\n",
      "utf8",
    );

    const success = await collectStream(
      streamMvpIntegratedFlow({
        sessionId: "sess_fenced_stream_success",
        prompt: [
          "Replace the exact fenced block in src/stream.ts",
          "```",
          "status: draft",
          "```",
          "with",
          "```",
          "status: ready",
          "```",
        ].join("\n"),
        workspaceRoot,
        escalationDecision: "allow-once",
        maxTurns: 6,
      }),
    );
    expect(success.at(-1)).toMatchObject({
      type: "query.completed",
      result: {
        status: "completed",
        terminalClassification: "success",
      },
    });

    const stopped = await collectStream(
      streamMvpIntegratedFlow({
        sessionId: "sess_fenced_stream_stopped",
        prompt:
          "Replace the similar fenced block in src/stream.ts with the closest new version.",
        workspaceRoot,
        escalationDecision: "allow-once",
        maxTurns: 6,
      }),
    );
    expect(stopped.at(-1)).toMatchObject({
      type: "query.completed",
      result: {
        status: "stopped_error",
        terminalClassification: "stopped",
      },
    });
  });
});

async function collectStream<T>(events: AsyncIterable<T>): Promise<T[]> {
  const collected: T[] = [];
  for await (const event of events) {
    collected.push(event);
  }
  return collected;
}
