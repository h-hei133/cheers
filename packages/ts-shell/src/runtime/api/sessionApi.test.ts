import { describe, expect, it } from "vitest";

import { projectSessionTree } from "../../session/sessionTreeProjection.js";
import {
  createRuntimeSessionApi,
  projectRuntimeSessionApiContract,
} from "./sessionApi.js";
import type { RuntimeProjectionEvent } from "../events/runtimeEventProjection.js";

describe("runtime session API boundary", () => {
  it("projects a host-neutral API contract without SDK, RPC, TUI, or CLI ownership", () => {
    const contract = projectRuntimeSessionApiContract();

    expect(contract).toMatchObject({
      ownerDomain: "runtime",
      hostBoundary: "host-neutral-api",
      cliRole: "host-adapter",
      capabilities: {
        startSession: "not-supported",
        submitPrompt: "not-supported",
        observeEvents: "available",
        sdkPackage: "not-provided",
        rpcServer: "not-provided",
        tuiHost: "not-provided",
      },
      truthfulness: {
        observationOnly: true,
        terminalSuccessClaim: false,
        successOwner: "evidence-result-verdict",
      },
    });
    expect(contract.operations).toEqual([
      "start-session",
      "submit-prompt",
      "observe-events",
      "abort",
      "stop",
      "get-session-projection",
      "get-result-projection",
      "get-capabilities",
    ]);
    expect(JSON.stringify(contract)).not.toContain('"success":true');
  });

  it("provides an in-process programmatic seam for session projection and ordered event observation", async () => {
    const events: RuntimeProjectionEvent[] = [
      makeEvent(2, "phase-observed"),
      makeEvent(1, "turn-snapshot-observed"),
    ];
    const sessionProjection = projectSessionTree({
      session: {
        id: "sess-api",
        projectRoot: "/workspace",
        createdAt: "2026-05-29T00:00:00.000Z",
        updatedAt: "2026-05-29T00:00:01.000Z",
        status: "active",
        turns: [],
      },
    });
    const api = createRuntimeSessionApi({
      driver: {
        startSession: async () => ({ sessionIdentity: "sess-api" }),
        submitPrompt: async ({ sessionIdentity }) => ({
          sessionIdentity,
          events,
        }),
        getEvents: () => events,
        getSessionProjection: () => sessionProjection,
        getResultProjection: () => ({
          status: "completed",
          terminalClassification: "success",
          terminalReason: "completed",
          verdictSource: "result",
        }),
      },
    });

    const started = await api.startSession();
    const submitted = await api.submitPrompt({
      sessionIdentity: "sess-api",
      prompt:
        "do not treat provider-called or command exit zero as terminal success",
    });
    const observed = api.observeEvents("sess-api");
    const projectedSession = api.getSessionProjection("sess-api");
    const projectedResult = api.getResultProjection("sess-api");

    expect(api.contract.capabilities).toMatchObject({
      startSession: "available",
      submitPrompt: "available",
      observeEvents: "available",
      getSessionProjection: "available",
      getResultProjection: "available",
      sdkPackage: "not-provided",
      rpcServer: "not-provided",
    });
    expect(started).toMatchObject({
      operation: "start-session",
      status: "accepted",
      sessionIdentity: "sess-api",
      terminalSuccessClaim: false,
    });
    expect(submitted.eventStream?.map((entry) => entry.sourceSequence)).toEqual([
      1,
      2,
    ]);
    expect(observed.eventStream?.map((entry) => entry.eventType)).toEqual([
      "turn-snapshot-observed",
      "phase-observed",
    ]);
    expect(projectedSession.sessionProjection?.activeLeafId).toBe(
      "sess-api:root",
    );
    expect(projectedResult.resultProjection).toMatchObject({
      terminalClassification: "success",
      verdictSource: "result",
    });
    expect(
      [
        started,
        submitted,
        observed,
        projectedSession,
        projectedResult,
      ].every((operation) => operation.terminalSuccessClaim === false),
    ).toBe(true);
    expect(JSON.stringify([submitted, observed])).not.toContain(
      '"success":true',
    );
  });

  it("keeps unsupported operations explicit and redacts session identities", async () => {
    const api = createRuntimeSessionApi();

    const submitted = await api.submitPrompt({
      sessionIdentity:
        "sess_unsafe /home/wang/.private-agents-real/provider.env token=secret",
      prompt: "raw provider output: hidden reasoning",
    });
    const aborted = await api.abort(
      "sess_unsafe /home/wang/.private-agents-real/provider.env",
    );
    const serialized = JSON.stringify([submitted, aborted]);

    expect(submitted).toMatchObject({
      operation: "submit-prompt",
      status: "not-supported",
      terminalSuccessClaim: false,
    });
    expect(aborted).toMatchObject({
      operation: "abort",
      status: "not-supported",
      terminalSuccessClaim: false,
    });
    expect(submitted.notProvenClaims).toContain("submit-prompt-support");
    expect(serialized).not.toMatch(
      /private-agents-real|provider.env token=secret|hidden reasoning/i,
    );
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
    facts: {
      terminalSuccessClaim: false,
    },
    notProvenClaims: ["terminal-success"],
    redaction: {
      status: "report-safe",
      excluded: [],
    },
  };
}
