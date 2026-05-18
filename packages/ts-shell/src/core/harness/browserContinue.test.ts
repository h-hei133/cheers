import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMvpIntegratedFlow } from "../../orchestration/runMvpIntegratedFlow.js";
import { buildSessionResumeContext } from "../../session/sessionResumeContextBuilder.js";
import type { SessionContinuitySnapshot } from "../../session/sessionContinuityTypes.js";
import { disabledBrowserRuntimeStatus } from "./browserAgentFixtures.js";

describe("Route 128 browser continue evidence", () => {
  let workspaceRoot = "";

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "browser-continue-"));
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  it("formats prior browser observe evidence for /continue without raw DOM", () => {
    const context = buildSessionResumeContext({
      currentPrompt: "continue from the previous browser observation",
      snapshot: snapshot([
        "browser-agent-observation:browser-obs-11111111:observe:success:ready:closed:Static fixture ready",
      ]),
    });

    expect(context).toContain("browser-agent-observation");
    expect(context).toContain("Static fixture ready");
    expect(context).not.toContain("<main");
    expect(context).not.toContain("sk-route126SECRET");
  });

  it("continues after prior browser click/type evidence", async () => {
    const result = await runMvpIntegratedFlow({
      sessionId: "sess_browser_continue_action",
      workspaceRoot,
      prompt: "continue and summarize the previous browser action",
      maxTurns: 4,
      browserRuntimeStatus: disabledBrowserRuntimeStatus(),
      continuityState: {
        lastContinuationEvidence: [
          "browser-agent-observation:browser-obs-22222222:click:success:ready:closed:Clicked Save draft",
          "browser-agent-observation:browser-obs-33333333:type:success:ready:closed:Updated Safe note",
        ],
      },
    });

    expect(result.status).toBe("completed");
    expect(result.finalOutput).toContain("Browser evidence from prior session");
    expect(result.finalOutput).toContain("Clicked Save draft");
    expect(result.finalOutput).toContain("Updated Safe note");
    expect(JSON.stringify(result)).not.toContain("<input");
  });

  it("continues after browser policy blocked and unavailable evidence", async () => {
    const result = await runMvpIntegratedFlow({
      sessionId: "sess_browser_continue_blocked",
      workspaceRoot,
      prompt: "continue from the previous browser failure",
      maxTurns: 4,
      browserRuntimeStatus: disabledBrowserRuntimeStatus(),
      continuityState: {
        lastContinuationEvidence: [
          "browser-agent-observation:browser-obs-blocked-policy:observe:stopped:policy-blocked:not-started:Public web automation is blocked",
          "browser-agent-observation:browser-obs-blocked-runtime:observe:stopped:runtime-disabled:not-started:Direct Playwright runtime disabled",
        ],
      },
    });

    expect(result.status).toBe("completed");
    expect(result.finalOutput).toContain("policy-blocked");
    expect(result.finalOutput).toContain("runtime-disabled");
    expect(result.finalOutput).toContain("Raw DOM: excluded");
  });

  function snapshot(evidence: readonly string[]): SessionContinuitySnapshot {
    return {
      sessionId: "sess_browser_snapshot",
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
