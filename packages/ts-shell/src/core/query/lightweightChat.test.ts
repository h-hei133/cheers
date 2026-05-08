import { describe, expect, it } from "vitest";
import { runLightweightChat, streamLightweightChat } from "./lightweightChat.js";

describe("lightweight chat route", () => {
  it("uses exactly one provider call for synthetic chat", async () => {
    const result = await runLightweightChat({
      sessionId: "sess_light",
      prompt: "这是一次测试",
      mode: "chat",
      providerMode: "synthetic",
    });

    expect(result.providerCallCount).toBe(1);
    expect(result.output).toContain("Lightweight chat response");
  });

  it("streams one coder turn without tool or approval events", async () => {
    const events = [];
    for await (const event of streamLightweightChat({
      sessionId: "sess_light_stream",
      prompt: "解释一下 turn 是什么",
      mode: "chat",
      providerMode: "synthetic",
    })) {
      events.push(event);
    }

    expect(events[0]?.type).toBe("query.started");
    expect(events[1]?.type).toBe("turn.started");
    expect(events.filter((event) => event.type === "message.delta").length).toBeGreaterThan(0);
    expect(events.at(-2)?.type).toBe("turn.completed");
    expect(events.at(-1)?.type).toBe("query.completed");
    expect(events.some((event) => event.type === "tool.started")).toBe(false);
    expect(events.some((event) => event.type === "approval.requested")).toBe(false);

    const completed = events.find((event) => event.type === "query.completed");
    expect(completed?.type).toBe("query.completed");
    if (completed?.type === "query.completed") {
      expect(completed.result.transcript.map((turn) => turn.role)).toEqual([
        "coder",
      ]);
      expect(completed.result.sharedContext.notes).toContain(
        "providerCalls=1",
      );
      expect(completed.result.sharedContext.notes).toContain(
        "write: disabled (router grants no permissions)",
      );
    }
  });

  it("keeps plan and analysis routes explicitly no-write", async () => {
    for (const mode of ["plan", "analysis"] as const) {
      const events = [];
      for await (const event of streamLightweightChat({
        sessionId: `sess_${mode}`,
        prompt: mode === "plan" ? "制定计划" : "分析错误",
        mode,
        providerMode: "synthetic",
      })) {
        events.push(event);
      }
      const completed = events.find((event) => event.type === "query.completed");
      expect(completed?.type).toBe("query.completed");
      if (completed?.type === "query.completed") {
        expect(completed.result.sharedContext.notes).toContain(
          "tool: skipped (lightweight no-write route)",
        );
      }
    }
  });

  it("preserves continuity seed notes in lightweight completed results", async () => {
    const events = [];
    for await (const event of streamLightweightChat({
      sessionId: "sess_light_continuity",
      prompt: "Read package.js for explicit target guard",
      mode: "chat",
      providerMode: "synthetic",
      continuityState: {
        lastTerminalClassification: "success",
        lastTerminalReason: "completed",
        lastActionResultSeed: {
          actionKind: "edit-file",
          target: "src/app.ts",
          changedFiles: ["src/app.ts"],
          verifiedFiles: ["src/app.ts"],
          verification: {
            status: "passed",
            command: "npm test -- src/app.test.ts",
            reason: "Focused test passed.",
          },
        },
        lastSuccessHandoffDiagnostic:
          "Success handoff: status=passed; target=src/app.ts; command=npm test -- src/app.test.ts; reason=Focused test passed.",
      },
    })) {
      events.push(event);
    }

    const completed = events.at(-1);
    expect(completed?.type).toBe("query.completed");
    if (completed?.type === "query.completed") {
      const notes = completed.result.sharedContext.notes.join("\n");
      expect(notes).toContain("restored-session-state-consumed");
      expect(notes).toContain("seed=action-result");
      expect(notes).toContain("seedAction=edit-file");
      expect(notes).toContain("seedTarget=src/app.ts");
      expect(notes).toContain("seedVerifyStatus=passed");
      expect(notes).toContain("seedVerifyCommandInherited=yes");
      expect(notes).toContain("explicit-target=package.js");
      expect(notes).toContain("seedInfluence=ignored-explicit-target");
      expect(notes).toContain("diagnosticHandoff=ignored-explicit-target");
    }
  });

  it("preserves writer-started write effect in lightweight continuity seed notes", async () => {
    const events = [];
    for await (const event of streamLightweightChat({
      sessionId: "sess_light_writer_started",
      prompt: "continue uncertain writer state",
      mode: "chat",
      providerMode: "synthetic",
      continuityState: {
        lastTerminalClassification: "stopped",
        lastTerminalReason: "stopped_error",
        lastActionResultSeed: {
          actionKind: "edit-file",
          target: "docs/uncertain-edit.md",
          changedFiles: [],
          verifiedFiles: [],
          writerStarted: true,
          writeEffect: "unknown",
          requiresUserInspection: true,
          verification: {
            status: "blocked",
            reason: "write effect unknown",
            blockerKind: "environment-not-ready",
          },
        },
        lastFailureHandoffDiagnostic:
          "Failure handoff: status=blocked; target=docs/uncertain-edit.md; writer-started=yes; write-effect=unknown; next=Re-read docs/uncertain-edit.md before retrying.",
      },
    })) {
      events.push(event);
    }

    const completed = events.at(-1);
    expect(completed?.type).toBe("query.completed");
    if (completed?.type === "query.completed") {
      const notes = completed.result.sharedContext.notes.join("\n");
      expect(notes).toContain("seed=action-result");
      expect(notes).toContain("seedTarget=docs/uncertain-edit.md");
      expect(notes).toContain("seedWriterStarted=yes");
      expect(notes).toContain("seedWriteEffect=unknown");
      expect(notes).toContain("seedRequiresUserInspection=yes");
      expect(notes).not.toContain("seedChangedFiles=");
    }
  });

  it("maps real provider fetch failures into a structured terminal result", async () => {
    const fetchFailure = Object.assign(new TypeError("fetch failed"), {
      cause: {
        name: "ConnectTimeoutError",
        code: "UND_ERR_CONNECT_TIMEOUT",
        message: "Connect Timeout Error",
      },
    });
    const fetchImpl = (async () => {
      throw fetchFailure;
    }) as typeof fetch;
    const events = [];

    for await (const event of streamLightweightChat({
      sessionId: "sess_light_error",
      prompt: "这是一次测试",
      mode: "chat",
      providerMode: "real",
      providerCredential: {
        provider: "openai-compatible",
        authMode: "api-key",
        apiKey: "sk-test-secret",
        baseUrl: "https://api.example.test/v1",
        model: "test-model",
        source: "config",
        envVarName: "TEST_API_KEY",
      },
      fetchImpl,
    })) {
      events.push(event);
    }

    expect(events.some((event) => event.type === "query.failed")).toBe(false);
    expect(events.some((event) => event.type === "lifecycle.error")).toBe(false);
    expect(events.some((event) => event.type === "tool.started")).toBe(false);
    expect(events.some((event) => event.type === "approval.requested")).toBe(false);
    expect(events.some((event) => event.type === "turn.started")).toBe(false);
    expect(events.some((event) => event.type === "turn.completed")).toBe(false);

    const completed = events.at(-1);
    expect(completed?.type).toBe("query.completed");
    if (completed?.type === "query.completed") {
      expect(completed.result.status).toBe("stopped_error");
      expect(completed.result.terminalClassification).toBe("error");
      expect(completed.result.stopReason).toContain("provider-network");
      expect(completed.result.stopReason).toContain("fetch failed");
      expect(completed.result.stopReason).not.toContain("sk-test-secret");
      expect(completed.result.sharedContext.notes).toContain("providerCalls=1");
      expect(completed.result.sharedContext.notes).toContain(
        "provider-error-kind=network",
      );
      expect(completed.result.sharedContext.notes).toContain(
        "write: disabled (router grants no permissions)",
      );
      expect(completed.result.transcript).toEqual([]);
    }
  });
});
