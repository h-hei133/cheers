import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMvpIntegratedFlow } from "../../orchestration/runMvpIntegratedFlow.js";
import { buildSessionResumeContext } from "../../session/sessionResumeContextBuilder.js";
import type { SessionContinuitySnapshot } from "../../session/sessionContinuityTypes.js";
import { disabledBrowserRuntimeStatus } from "./browserAgentFixtures.js";

describe("Route 129 browser transaction continuation", () => {
  let workspaceRoot = "";

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "browser-txn-continue-"));
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  it("/continue summarizes successful transaction without raw DOM", () => {
    const context = buildSessionResumeContext({
      currentPrompt: "continue from the previous browser transaction",
      snapshot: snapshot([
        "browser-agent-transaction:browser-txn-obs-11111111:browser-txn-aaa:success:ready:not-needed:closed:Clicked Save draft",
      ]),
    });

    expect(context).toContain("browser-agent-transaction");
    expect(context).toContain("Clicked Save draft");
    expect(context).not.toContain("<main");
  });

  it("continues after repaired transaction", async () => {
    const result = await runContinue([
      "browser-agent-transaction:browser-txn-obs-22222222:browser-txn-bbb:success:ready:succeeded:closed:Clicked Save draft after repair",
    ]);

    expect(result.status).toBe("completed");
    expect(result.finalOutput).toContain("Browser evidence from prior session");
    expect(result.finalOutput).toContain("succeeded");
    expect(result.finalOutput).toContain("Clicked Save draft after repair");
  });

  it("continues after failed repair", async () => {
    const result = await runContinue([
      "browser-agent-transaction:browser-txn-obs-33333333:browser-txn-ccc:stopped:repair-failed:failed:closed:repair requires exactly one safe controlled candidate",
    ]);

    expect(result.status).toBe("completed");
    expect(result.finalOutput).toContain("repair-failed");
    expect(result.finalOutput).toContain("repair requires exactly one safe controlled candidate");
  });

  it("continues after timeout with cleanup evidence", async () => {
    const result = await runContinue([
      "browser-agent-transaction:browser-txn-obs-44444444:browser-txn-ddd:failed:navigation-timeout:not-needed:closed:Direct Playwright operation timed out",
    ]);

    expect(result.status).toBe("completed");
    expect(result.finalOutput).toContain("navigation-timeout");
    expect(result.finalOutput).toContain("closed");
  });

  it("continues from compact transaction trace evidence without page state", async () => {
    const result = await runContinue([
      "browser-agent-transaction-trace:browser-txn-trace-66666666:browser-txn-fff:success:ready:succeeded:closed:clean:Clicked Save draft from trace",
    ]);

    expect(result.status).toBe("completed");
    expect(result.finalOutput).toContain("Browser evidence from prior session");
    expect(result.finalOutput).toContain("browser-agent-transaction-trace");
    expect(result.finalOutput).toContain("Clicked Save draft from trace");
    expect(JSON.stringify(result)).not.toContain("<main");
  });

  it("contains no raw DOM or secrets in continuation output", async () => {
    const result = await runContinue([
      "browser-agent-transaction:browser-txn-obs-55555555:browser-txn-eee:success:ready:not-needed:closed:[REDACTED_SECRET] visible summary",
    ]);
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain("<input");
    expect(serialized).not.toContain("sk-route126SECRET");
    expect(serialized).toContain("Raw DOM: excluded");
  });

  async function runContinue(evidence: readonly string[]) {
    return runMvpIntegratedFlow({
      sessionId: `sess_${Math.random().toString(16).slice(2)}`,
      workspaceRoot,
      prompt: "continue and summarize the previous browser transaction",
      maxTurns: 4,
      browserRuntimeStatus: disabledBrowserRuntimeStatus(),
      continuityState: {
        lastContinuationEvidence: evidence,
      },
    });
  }

  function snapshot(evidence: readonly string[]): SessionContinuitySnapshot {
    return {
      sessionId: "sess_browser_txn_snapshot",
      projectRoot: workspaceRoot,
      lastUserIntent: "Use the browser fixture",
      lastAssistantOutput: "Browser task completed",
      lastTerminalClassification: "success",
      lastTerminalReason: "completed",
      lastTaskKind: "browser",
      recentChangedFiles: [],
      recentTargetFiles: [],
      recentFailedFiles: [],
      recentVerifiedFiles: [],
      lastRepairNotes: [],
      lastContinuationStatus: "first-pass-success",
      lastContinuationEvidence: evidence,
      lastTaskSatisfactionVerdict: "satisfied",
      lastTaskSatisfactionReasons: [],
      unresolvedItems: [],
    };
  }
});
