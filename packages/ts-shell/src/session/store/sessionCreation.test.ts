import { describe, expect, it } from "vitest";
import type { Session } from "../schema/sessionRecord.js";
import { createSession, createSessionWithId } from "./sessionCreation.js";

describe("sessionCreation", () => {
  it("creates a bound active session and updates current selection", () => {
    const writes: Session[] = [];
    const selections: Array<{ projectRoot: string; sessionId: string }> = [];

    const session = createSession({
      callbacks: {
        sessionExists: () => false,
        validateSessionId: (sessionId) => sessionId,
        createSessionId: () => "sess_created",
        writeSession: (nextSession) => writes.push(nextSession),
        setCurrentSessionForProject: (projectRoot, sessionId) =>
          selections.push({ projectRoot, sessionId }),
        now: () => "2026-05-28T00:00:07.000Z",
      },
      projectRoot: "/repo",
      options: { rootMode: "git-root", gitRoot: "/repo" },
    });

    expect(session).toEqual(
      expect.objectContaining({
        id: "sess_created",
        projectRoot: "/repo",
        rootMode: "git-root",
        gitRoot: "/repo",
        status: "active",
        createdAt: "2026-05-28T00:00:07.000Z",
        updatedAt: "2026-05-28T00:00:07.000Z",
      }),
    );
    expect(writes).toEqual([session]);
    expect(selections).toEqual([
      { projectRoot: "/repo", sessionId: "sess_created" },
    ]);
  });

  it("rejects duplicate explicit session ids after validation", () => {
    expect(() =>
      createSessionWithId({
        callbacks: {
          sessionExists: () => true,
          validateSessionId: () => "sess_existing",
          createSessionId: () => "unused",
          writeSession: () => undefined,
          setCurrentSessionForProject: () => undefined,
          now: () => "2026-05-28T00:00:08.000Z",
        },
        sessionId: "sess_existing",
        projectRoot: "/repo",
      }),
    ).toThrow("Session sess_existing already exists");
  });
});
