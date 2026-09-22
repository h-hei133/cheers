import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Session } from "../schema/sessionRecord.js";
import {
  createSessionStoreLayout,
  locateExistingSessionLayout,
  projectSessionFileLayout,
} from "./sessionFileLayout.js";
import {
  loadSessionRecord,
  sessionExistsAtLayout,
  writeSessionRecord,
} from "./sessionStore.js";

describe("sessionStore", () => {
  it("writes and loads metadata, state, and transcript without schema drift", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "session-store-"));
    try {
      const layout = createSessionStoreLayout(home);
      const fileLayout = projectSessionFileLayout({
        sessionsDir: layout.sessionsDir,
        sessionId: "sess_store",
      });
      const session: Session = {
        id: "sess_store",
        projectRoot: "/repo",
        rootMode: "git-root",
        requestedWorkspaceRoot: "/repo/pkg",
        targetPathBase: "/repo",
        gitRoot: "/repo",
        createdAt: "2026-05-28T00:00:00.000Z",
        updatedAt: "2026-05-28T00:00:01.000Z",
        status: "active",
        turns: [],
        pendingPrompt: "continue",
      };

      writeSessionRecord({ session, layout: fileLayout });

      expect(sessionExistsAtLayout(fileLayout)).toBe(true);
      expect(JSON.parse(fs.readFileSync(fileLayout.metadataPath, "utf8"))).toEqual(
        expect.objectContaining({
          id: "sess_store",
          projectRoot: "/repo",
          rootMode: "git-root",
          requestedWorkspaceRoot: "/repo/pkg",
          targetPathBase: "/repo",
          gitRoot: "/repo",
        }),
      );
      expect(JSON.parse(fs.readFileSync(fileLayout.statePath, "utf8"))).toEqual(
        expect.objectContaining({
          status: "active",
          projectRoot: "/repo",
          pendingPrompt: "continue",
          runPhase: "idle",
        }),
      );
      expect(fs.readFileSync(fileLayout.transcriptPath, "utf8")).toBe("");

      expect(loadSessionRecord({
        sessionId: "sess_store",
        layout: fileLayout,
        cwd: "/fallback",
      })).toEqual(expect.objectContaining(session));
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("finds the session directories an earlier name left behind", () => {
    // The rename must not strand state: sessions written under the previous
    // directory are still that person's sessions, and a listing or a resume that
    // only looked in the current directory would silently lose all of them.
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "session-store-legacy-"));
    try {
      for (const name of [".private-agents", ".cheer"]) {
        fs.mkdirSync(path.join(home, name, "sessions"), { recursive: true });
      }
      fs.writeFileSync(
        path.join(home, ".private-agents", "current-session.json"),
        JSON.stringify({ schemaVersion: 1, byProjectRoot: {} }),
        "utf8",
      );

      const layout = createSessionStoreLayout(home);

      expect(layout.sessionsDir).toBe(path.join(home, ".cheers", "sessions"));
      expect(layout.sessionsSearchDirs).toEqual([
        path.join(home, ".cheers", "sessions"),
        path.join(home, ".cheer", "sessions"),
        path.join(home, ".private-agents", "sessions"),
      ]);
      // The pointer store is read the same way, and the current path stays first
      // even when no older store exists, since that is where new ones are written.
      expect(layout.currentSessionStoreSearchPaths).toEqual([
        path.join(home, ".cheers", "current-session.json"),
        path.join(home, ".private-agents", "current-session.json"),
      ]);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("locates a session by id in the directory that actually holds it", () => {
    // Knowing the directories is not enough: a reader that has the list but
    // builds a path from the current directory alone finds nothing for a session
    // an earlier name left behind, and reports it as missing rather than opening
    // it. This is the step that turns the search list into an actual read.
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "session-store-locate-"));
    try {
      const legacyDir = path.join(home, ".private-agents", "sessions");
      fs.mkdirSync(path.join(legacyDir, "sess_legacy"), { recursive: true });

      const located = locateExistingSessionLayout(
        createSessionStoreLayout(home),
        "sess_legacy",
      );

      expect(located.sessionDir).toBe(path.join(legacyDir, "sess_legacy"));
      expect(located.transcriptPath).toBe(
        path.join(legacyDir, "sess_legacy", "transcript.jsonl"),
      );
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("falls back to the current directory for a session that does not exist yet", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "session-store-locate-new-"));
    try {
      const located = locateExistingSessionLayout(
        createSessionStoreLayout(home),
        "sess_new",
      );

      expect(located.sessionDir).toBe(path.join(home, ".cheers", "sessions", "sess_new"));
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});
