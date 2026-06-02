import { describe, expect, it } from "vitest";

import { createHostRuntime } from "./runtime.js";
import {
  classifyHostExit,
  parseHostJsonInput,
  projectHostJsonError,
  projectHostJsonResponse,
} from "./io.js";

describe("host json surface", () => {
  it("projects versioned json output with event envelopes independent of terminal text", async () => {
    const host = createHostRuntime();
    const response = await host.dispatch({
      action: "start-turn",
      inputText: "read a safe file",
      mode: "read-only",
      providerMode: "synthetic",
      correlationId: "json-happy",
    });

    const output = projectHostJsonResponse({ response });

    expect(output).toMatchObject({
      schemaVersion: "host-json-response.v1",
      commandId: "json-happy",
      action: "start-turn",
      accepted: true,
      terminalSuccessClaim: false,
      exit: {
        classification: "completed-without-proof",
        code: 0,
        terminalSuccessClaim: false,
      },
    });
    expect(output.ordering.eventCount).toBe(output.events.length);
    expect(output.events[0]).toMatchObject({
      schemaVersion: "host-event.v1",
      category: expect.any(String),
      severity: expect.any(String),
      terminalSuccessClaim: false,
    });
    expect(JSON.stringify(output)).not.toContain("safe final response\n");
    expect(JSON.stringify(output)).not.toContain('"terminalSuccessClaim":true');
  });

  it("classifies invalid, unsupported, blocked, stopped, and success-proof exits", async () => {
    const host = createHostRuntime();
    const invalid = await host.dispatch({});
    const unsupported = await host.dispatch({ action: "unknown" });
    const providerBlocked = await host.dispatch({
      action: "start-turn",
      inputText: "provider blocked",
      mode: "read-only",
      providerMode: "real",
    });
    const stoppedSeed = await host.dispatch({
      action: "start-turn",
      inputText: "read a safe file",
      mode: "read-only",
      providerMode: "synthetic",
    });
    const stopped = await host.dispatch({
      action: "stop-work",
      sessionId: stoppedSeed.sessionId,
    });
    const complete = await host.dispatch({
      action: "start-turn",
      inputText: "apply controlled mutation with complete proof",
      mode: "mutation",
      providerMode: "synthetic",
    });

    expect(classifyHostExit(invalid).classification).toBe("invalid-input");
    expect(classifyHostExit(unsupported).classification).toBe("unsupported");
    expect(classifyHostExit(providerBlocked).classification).toBe("blocked");
    expect(classifyHostExit(stopped).classification).toBe("stopped");
    expect(classifyHostExit(complete).classification).toBe("success-proof");
    expect(classifyHostExit(complete).terminalSuccessClaim).toBe(false);
  });

  it("returns structured json errors for malformed command input", () => {
    expect(() => parseHostJsonInput("{bad json")).toThrow();

    const output = projectHostJsonError({
      error: new Error("unexpected token with private path /home/wang/.private-agents-real"),
      commandId: "bad-json",
    });

    expect(output.schemaVersion).toBe("host-json-response.v1");
    expect(output.exit.classification).toBe("internal-error");
    expect(output.terminalSuccessClaim).toBe(false);
    expect(JSON.stringify(output)).not.toContain("/home/wang/.private-agents-real");
  });
});
