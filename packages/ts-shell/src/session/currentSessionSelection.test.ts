import { describe, expect, it } from "vitest";
import type { Session } from "./SessionManager.js";
import {
  createEmptyCurrentSessionSelectionStore,
  parseCurrentSessionSelectionStore,
  selectCurrentSession,
} from "./currentSessionSelection.js";

describe("currentSessionSelection", () => {
  it("parses invalid stores as empty with a stable diagnostic", () => {
    const result = parseCurrentSessionSelectionStore(
      { schemaVersion: 2 },
      "/tmp/current-session.json",
    );

    expect(result.store).toEqual(createEmptyCurrentSessionSelectionStore());
    expect(result.readError).toBe(
      "Invalid current session selection store at /tmp/current-session.json",
    );
  });

  it("projects unselected, missing, load-failed, mismatch, and selected states", () => {
    expect(
      selectCurrentSession({
        projectRoot: "/workspace",
        normalizedProjectRoot: "/workspace",
        storeReadError: null,
      }),
    ).toEqual({
      resolution: {
        ok: false,
        reason: "none",
        detail: "No current session is selected for /workspace.",
      },
      clearSelection: false,
    });

    expect(
      selectCurrentSession({
        projectRoot: "/workspace",
        normalizedProjectRoot: "/workspace",
        storeReadError: null,
        selection: { sessionId: "sess_missing", updatedAt: "2026-01-01T00:00:00.000Z" },
        sessionExists: false,
      }),
    ).toEqual({
      resolution: {
        ok: false,
        reason: "missing-session",
        sessionId: "sess_missing",
        detail: "Current session sess_missing no longer exists for /workspace.",
      },
      clearSelection: true,
    });

    expect(
      selectCurrentSession({
        projectRoot: "/workspace",
        normalizedProjectRoot: "/workspace",
        storeReadError: null,
        selection: { sessionId: "sess_bad", updatedAt: "2026-01-01T00:00:00.000Z" },
        loadError: new Error("bad json"),
      }).resolution,
    ).toMatchObject({
      ok: false,
      reason: "load-failed",
      sessionId: "sess_bad",
      detail: "Current session sess_bad could not be loaded for /workspace: bad json.",
    });

    const session = makeSession({ id: "sess_ok", projectRoot: "/workspace" });
    expect(
      selectCurrentSession({
        projectRoot: "/workspace",
        normalizedProjectRoot: "/workspace",
        storeReadError: null,
        selection: { sessionId: "sess_ok", updatedAt: "2026-01-01T00:00:00.000Z" },
        session,
        sessionProjectRoot: "/other",
        normalizedSessionProjectRoot: "/other",
      }),
    ).toEqual({
      resolution: {
        ok: false,
        reason: "project-root-mismatch",
        sessionId: "sess_ok",
        detail: "Current session sess_ok is bound to /other, not /workspace.",
      },
      clearSelection: true,
    });

    expect(
      selectCurrentSession({
        projectRoot: "/workspace",
        normalizedProjectRoot: "/workspace",
        storeReadError: null,
        selection: { sessionId: "sess_ok", updatedAt: "2026-01-01T00:00:00.000Z" },
        session,
        sessionProjectRoot: "/workspace",
        normalizedSessionProjectRoot: "/workspace",
      }),
    ).toEqual({
      resolution: { ok: true, session },
      clearSelection: false,
    });
  });
});

function makeSession(input: {
  readonly id: string;
  readonly projectRoot: string;
}): Session {
  return {
    id: input.id,
    projectRoot: input.projectRoot,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    status: "active",
    turns: [],
  };
}
