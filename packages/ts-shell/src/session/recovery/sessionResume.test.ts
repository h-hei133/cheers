import { describe, expect, it } from "vitest";
import type { Session } from "../schema/sessionRecord.js";
import { resumeSession, tryResumeSession } from "./sessionResume.js";

function createSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "sess_resume",
    projectRoot: "/repo",
    createdAt: "2026-05-28T00:00:00.000Z",
    updatedAt: "2026-05-28T00:00:00.000Z",
    status: "interrupted",
    turns: [],
    ...overrides,
  };
}

describe("sessionResume", () => {
  it("marks loaded sessions active and preserves current selection side effect", () => {
    const session = createSession({ projectRoot: "" });
    const selections: Array<{ projectRoot: string; sessionId: string }> = [];

    const resumed = resumeSession(
      {
        sessionDirExists: () => true,
        sessionDir: () => "/sessions/sess_resume",
        loadSession: () => session,
        writeSessionMetadata: () => undefined,
        setCurrentSessionForProject: (projectRoot, sessionId) =>
          selections.push({ projectRoot, sessionId }),
        evaluateRecoveryTrustBoundary: () => ({ recoverable: true }),
        cwd: () => "/cwd",
        now: () => "2026-05-28T00:00:09.000Z",
      },
      session.id,
      "/repo",
    );

    expect(resumed.status).toBe("active");
    expect(resumed.projectRoot).toBe("/repo");
    expect(resumed.updatedAt).toBe("2026-05-28T00:00:09.000Z");
    expect(selections).toEqual([{ projectRoot: "/repo", sessionId: session.id }]);
  });

  it("returns recovery trust-boundary blocks without resuming", () => {
    const session = createSession();
    const result = tryResumeSession(
      {
        sessionDirExists: () => true,
        sessionDir: () => "/sessions/sess_resume",
        loadSession: () => session,
        writeSessionMetadata: () => {
          throw new Error("should not write");
        },
        setCurrentSessionForProject: () => {
          throw new Error("should not select");
        },
        evaluateRecoveryTrustBoundary: () => ({
          recoverable: false,
          reason: "terminal-truth-unavailable",
          block: {
            sessionId: session.id,
            sessionDir: "/sessions/sess_resume",
            reason: "terminal-truth-unavailable",
            detail: "missing terminal evidence",
            recoveryHint: "start fresh",
          },
        }),
        cwd: () => "/cwd",
        now: () => "2026-05-28T00:00:10.000Z",
      },
      session.id,
    );

    expect(result).toEqual({
      ok: false,
      error:
        "Session sess_resume is not recoverable: missing terminal evidence",
      recoveryHint: "start fresh",
    });
  });
});
