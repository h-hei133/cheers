import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Session } from "../schema/sessionRecord.js";
import {
  createSessionStoreLayout,
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
});
