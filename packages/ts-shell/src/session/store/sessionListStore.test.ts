import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Session } from "../schema/sessionRecord.js";
import { listSessionRecords, type SessionListWarningState } from "./sessionListStore.js";

function createSession(id: string, updatedAt: string): Session {
  return {
    id,
    projectRoot: "/repo",
    createdAt: "2026-05-28T00:00:00.000Z",
    updatedAt,
    status: "active",
    turns: [],
  };
}

describe("sessionListStore", () => {
  it("loads only session directories and sorts by most recent update", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "session-list-"));
    try {
      fs.mkdirSync(path.join(root, "older"));
      fs.mkdirSync(path.join(root, "newer"));
      fs.writeFileSync(path.join(root, "ignored.txt"), "", "utf8");
      const state: SessionListWarningState = {
        warnedUnreadableSessionDirs: new Set(),
        didWarnListSessionsFailure: false,
      };

      const sessions = listSessionRecords({
        sessionsDir: root,
        warningState: state,
        warn: () => undefined,
        loadSession: (sessionId) =>
          sessionId === "older"
            ? createSession("older", "2026-05-28T00:00:01.000Z")
            : createSession("newer", "2026-05-28T00:00:02.000Z"),
      });

      expect(sessions.map((session) => session.id)).toEqual(["newer", "older"]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("warns once for unreadable session directories", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "session-list-"));
    try {
      fs.mkdirSync(path.join(root, "bad"));
      const warnings: string[] = [];
      const state: SessionListWarningState = {
        warnedUnreadableSessionDirs: new Set(),
        didWarnListSessionsFailure: false,
      };

      for (let index = 0; index < 2; index += 1) {
        listSessionRecords({
          sessionsDir: root,
          warningState: state,
          warn: (message) => warnings.push(message),
          loadSession: () => {
            throw new Error("bad session");
          },
        });
      }

      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain("bad");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
