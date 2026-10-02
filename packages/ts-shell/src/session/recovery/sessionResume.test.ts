import { describe, expect, it, vi } from "vitest";
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
  function callbacks() {
    return {
      sessionDirExists: () => true,
      sessionDir: () => "/sessions/sess_resume",
      loadSession: vi.fn(() => createSession()),
      writeSessionMetadata: vi.fn(),
      setCurrentSessionForProject: vi.fn(),
      evaluateRecoveryTrustBoundary: vi.fn(() => ({ recoverable: true, disposition: "fully-resumable" as const, autoResumeReady: true, detail: "ready" })),
      cwd: () => "/repo",
      now: () => "2026-05-28T00:00:09.000Z",
    };
  }

  it("activates the exact session that passed recovery admission", () => {
    const host = callbacks();
    host.loadSession.mockReturnValueOnce(createSession()).mockReturnValue(createSession({ status: "terminated" }));
    expect(tryResumeSession(host, "sess_resume").ok).toBe(true);
    expect(host.loadSession).toHaveBeenCalledTimes(1);
  });

  it("rejects a negative admission even when it has no optional block", () => {
    const host = { ...callbacks(), evaluateRecoveryTrustBoundary: () => ({ recoverable: false, disposition: "not-resumable" as const, autoResumeReady: false, detail: "no evidence" }) };
    expect(tryResumeSession(host, "sess_resume")).toMatchObject({ ok: false, error: expect.stringContaining("no evidence") });
    expect(host.writeSessionMetadata).not.toHaveBeenCalled();
    expect(host.setCurrentSessionForProject).not.toHaveBeenCalled();
  });

  it("does not mutate the loaded session when selecting it fails", () => {
    const host = callbacks();
    const session = createSession();
    host.loadSession.mockReturnValue(session);
    host.setCurrentSessionForProject.mockImplementation(() => { throw new Error("selection write failed"); });
    expect(tryResumeSession(host, session.id)).toMatchObject({ ok: false });
    expect(session.status).toBe("interrupted");
  });
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
