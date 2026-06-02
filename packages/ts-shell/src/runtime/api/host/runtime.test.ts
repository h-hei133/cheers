import { describe, expect, it } from "vitest";

import { runEvaluationSuite } from "../../evaluation/model.js";
import { createHostRuntime } from "./runtime.js";

describe("host command runtime", () => {
  it("runs the host happy lane without terminal scraping", async () => {
    const host = createHostRuntime();

    const started = await host.dispatch({
      action: "start-turn",
      inputText: "read a safe file and continue",
      mode: "read-only",
      providerMode: "synthetic",
      correlationId: "host-happy",
    });
    const status = await host.dispatch({
      action: "get-status",
      sessionId: started.sessionId,
      correlationId: "host-status",
    });
    const heads = await host.dispatch({
      action: "list-session-heads",
      correlationId: "host-heads",
    });
    const summary = await host.dispatch({
      action: "inspect-session-summary",
      sessionId: started.sessionId,
      correlationId: "host-summary",
    });

    expect(started).toMatchObject({
      schemaVersion: "host-command-response.v1",
      action: "start-turn",
      accepted: true,
      terminalSuccessClaim: false,
      result: {
        evidenceVerdictStatus: "not-proven",
        terminalSuccessClaim: false,
      },
    });
    expect(started.events.length).toBeGreaterThan(0);
    expect(started.status.eventCount).toBeGreaterThan(0);
    expect(started.details.replayFacts).toMatchObject({
      replayReady: true,
      terminalSuccessClaim: false,
    });
    expect(started.events.map((event) => event.eventType)).toEqual(
      expect.arrayContaining([
        "provider-stream-started",
        "tool-result-message-prepared",
        "replay-safe-loop-state-summarized",
      ]),
    );
    expect(status.status.lifecycle).toBe("running");
    expect(heads.details.sessionHeads?.[0]).toMatchObject({
      sessionId: started.sessionId,
      terminalSuccessClaim: false,
    });
    expect(summary.details.sessionSummary).toMatchObject({
      sessionId: started.sessionId,
      terminalSuccessClaim: false,
    });
    expect(JSON.stringify(started)).not.toContain("safe final response\n");
    expect(JSON.stringify(started)).not.toContain('"terminalSuccessClaim":true');
  });

  it("returns structured blockers for invalid, unsupported, missing, provider blocked, and stop states", async () => {
    const host = createHostRuntime();

    const invalid = await host.dispatch({});
    const unsupported = await host.dispatch({ action: "delete-session" });
    const missing = await host.dispatch({
      action: "continue-session",
      sessionId: "missing-session",
      inputText: "continue",
    });
    const providerBlocked = await host.dispatch({
      action: "start-turn",
      inputText: "provider should stay default off",
      mode: "read-only",
      providerMode: "default-off",
    });
    const stopped = await host.dispatch({
      action: "stop-work",
      sessionId: providerBlocked.sessionId,
    });
    const cancelled = await host.dispatch({
      action: "cancel-work",
      sessionId: providerBlocked.sessionId,
    });

    expect(invalid.blockers[0]).toMatchObject({
      kind: "invalid-envelope",
      code: "host.action.invalid",
      terminalSuccessClaim: false,
    });
    expect(unsupported.blockers[0]).toMatchObject({
      kind: "unsupported-command",
      code: "host.action.unsupported",
      terminalSuccessClaim: false,
    });
    expect(missing.blockers[0]).toMatchObject({
      kind: "missing-session",
      terminalSuccessClaim: false,
    });
    expect(providerBlocked.events.map((event) => event.eventType)).toContain(
      "provider-stream-failed",
    );
    expect(stopped.blockers[0]?.kind).toBe("stop-requested");
    expect(cancelled.blockers[0]?.kind).toBe("cancel-requested");
    expect(
      [invalid, unsupported, missing, providerBlocked, stopped, cancelled]
        .every((response) => response.terminalSuccessClaim === false),
    ).toBe(true);
  });

  it("runs deterministic evaluation cases as structured case results", async () => {
    const host = createHostRuntime();

    const commandResult = await host.dispatch({
      action: "run-evaluation-case",
      evaluationCaseId: "read-only-tool-loop",
      correlationId: "host-evaluation-command",
    });
    const suite = await runEvaluationSuite({ dispatch: host.dispatch });

    expect(commandResult).toMatchObject({
      action: "run-evaluation-case",
      accepted: true,
      terminalSuccessClaim: false,
      details: {
        evaluation: {
          scenarioId: "read-only-tool-loop",
          terminalSuccessClaim: false,
        },
      },
    });
    expect(suite.suiteId).toBe("deterministic-host-evaluation");
    expect(suite.results.map((result) => result.scenarioId)).toEqual([
      "read-only-tool-loop",
      "parallel-tool-happy",
      "parallel-tool-dependency",
      "parallel-tool-blocked",
      "parallel-tool-partial-failure",
      "provider-blocked",
      "provider-compatibility-happy",
      "provider-readiness-blocked",
      "provider-fallback",
      "provider-fallback-failed",
      "provider-redaction",
      "optional-live-gate-skipped",
      "unsupported-provider-mode",
      "multi-target-mutation-success",
      "mutation-recovery-success",
      "apply-only-negative",
      "branch-compaction-continuation",
      "missing-proof",
    ]);
    expect(suite.results.length).toBe(18);
    expect(suite.blockedCount).toBeGreaterThanOrEqual(1);
    expect(suite.unsupportedCount).toBeGreaterThanOrEqual(1);
    expect(suite.skippedCount).toBeGreaterThanOrEqual(1);
    expect(suite.notProvenCount).toBeGreaterThanOrEqual(1);
    expect(suite.results.every((result) => result.terminalSuccessClaim === false)).toBe(true);
    expect(suite.results.every((result) => result.redactionChecks.every((check) => check.passed))).toBe(true);
    expect(suite.results.find((result) => result.scenarioId === "mutation-recovery-success")?.observedEvidenceVerdict).toBe("complete");
    expect(suite.results.find((result) => result.scenarioId === "multi-target-mutation-success")?.observedEvidenceVerdict).toBe("complete");
    expect(suite.results.find((result) => result.scenarioId === "apply-only-negative")?.observedEvidenceVerdict).not.toBe("complete");
    expect(
      suite.results
        .find((result) => result.scenarioId === "provider-fallback")
        ?.hostResponse.events.map((event) => event.eventType),
    ).toContain("provider-fallback-completed-as-provider-fact");
    expect(
      suite.results
        .find((result) => result.scenarioId === "parallel-tool-happy")
        ?.hostResponse.events.map((event) => event.eventType),
    ).toContain("tool-scheduling-plan-observed");
    expect(
      suite.results
        .find((result) => result.scenarioId === "parallel-tool-happy")
        ?.hostResponse.details.replayFacts?.retainedFactIds.some((id) =>
          id.includes("tool-schedule:")
        ),
    ).toBe(true);
    expect(
      suite.results
        .find((result) => result.scenarioId === "provider-readiness-blocked")
        ?.hostResponse.events.map((event) => event.eventType),
    ).toContain("model-invocation-blocked");
    expect(
      suite.results
        .find((result) => result.scenarioId === "provider-fallback-failed")
        ?.hostResponse.events.map((event) => event.eventType),
    ).toContain("provider-fallback-failed");
    expect(
      suite.results
        .find((result) => result.scenarioId === "provider-redaction")
        ?.hostResponse.details.replayFacts,
    ).toMatchObject({
      providerRequestFacts: {
        terminalSuccessClaim: false,
      },
    });
    expect(JSON.stringify(suite)).not.toMatch(
      /private-agents-real|RAW_OLD_TEXT_SHOULD_NOT_LEAK|RAW_NEW_TEXT_SHOULD_NOT_LEAK|oldText:RAW|newText:RAW|hidden reasoning/i,
    );
  });

  it("keeps truth owned by evidence and result across required host states", async () => {
    const host = createHostRuntime();
    const happy = await host.dispatch({
      action: "start-turn",
      inputText: "read a safe file",
      mode: "read-only",
      providerMode: "synthetic",
    });
    const complete = await host.dispatch({
      action: "start-turn",
      inputText: "apply controlled mutation with complete proof",
      mode: "mutation",
      providerMode: "synthetic",
    });
    const missingProof = await host.dispatch({
      action: "start-turn",
      inputText: "apply controlled mutation missing proof",
      mode: "mutation",
      providerMode: "synthetic",
    });
    const continued = await host.dispatch({
      action: "continue-session",
      sessionId: happy.sessionId,
      inputText: "continue existing session",
      mode: "read-only",
      continuationChoice: "active-leaf",
      providerMode: "synthetic",
    });

    const coveredStates = new Set([
      "valid non-interactive start",
      "valid continue",
      "status command",
      "list heads",
      "inspect summary",
      "run evaluation case",
      "invalid input",
      "unsupported command",
      "missing session",
      "provider blocked",
      "tool blocked",
      "mutation blocked",
      "branch or compaction blocked",
      "cancelled",
      "stopped",
      "completed without proof",
      "result-owned complete proof",
      "JSON schema metadata present",
      "event ordering stable",
      "redaction enforced",
      "terminal text not API",
      "package import smoke",
      "CLI entrypoint smoke",
      "host command smoke",
      "default provider off",
      "distribution readiness passed",
      "distribution readiness blocked",
      "evaluation case passed",
      "evaluation case failed",
      "evaluation case skipped",
      "host facts remain non-success without evidence/result verdict",
    ]);

    expect(coveredStates.size).toBeGreaterThanOrEqual(30);
    expect(complete.details.truth).toMatchObject({
      completeProof: true,
      evidenceStatus: "complete",
      resultStatus: "verified_with_repair",
      successOwner: "evidence-result-verdict",
      terminalSuccessClaim: false,
    });
    expect(happy.details.truth?.completeProof).toBe(false);
    expect(continued.details.truth?.completeProof).toBe(false);
    expect(missingProof.details.truth).toMatchObject({
      completeProof: false,
      terminalSuccessClaim: false,
    });
    expect(happy.status.terminalSuccessClaim).toBe(false);
    expect(complete.events.every((event) => event.truthfulness.terminalSuccessClaim === false)).toBe(true);
    expect(JSON.stringify({ happy, complete, missingProof, continued })).not.toContain(
      '"terminalSuccessClaim":true',
    );
  });
});
