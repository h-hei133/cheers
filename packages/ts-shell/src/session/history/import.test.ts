import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { importHistory } from "./import.js";
import { historyDigest, type HistoryDocument } from "./model.js";
import { SessionStoreAccess } from "../store/sessionStoreAccess.js";
import { writeJsonFileAtomic } from "../store/sessionFileStore.js";

let home: string;
let projectRoot: string;

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "cheers-history-home-"));
  projectRoot = fs.mkdtempSync(path.join(home, "project-"));
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.CHEERS_TEST_ROOT = home;
});

afterEach(() => {
  delete process.env.CHEERS_TEST_ROOT;
  fs.rmSync(home, { recursive: true, force: true });
});

function document(): HistoryDocument {
  return {
    kind: "session-history", version: 1, sourceId: "source-session", title: "Imported history",
    leafId: "turn-1",
    nodes: [
      { id: "root", kind: "session-root" },
      { id: "turn-1", parentId: "root", kind: "turn-message" },
    ],
    entries: [{ id: "turn-1", role: "user", content: "Imported prompt", timestamp: "2026-10-11T00:00:00.000Z" }],
  };
}

describe("versioned history import", () => {
  it("reuses an already complete digest and rejects a conflicting occupant", () => {
    const input = document();
    const first = importHistory(input, projectRoot, () => undefined);
    expect(first.reused).toBe(false);
    const second = importHistory(input, projectRoot, () => undefined);
    expect(second).toEqual({ id: first.id, reused: true });

    const store = new SessionStoreAccess();
    const statePath = store.statePath(first.id);
    const state = store.readStateSnapshotRequired(statePath);
    writeJsonFileAtomic(statePath, { ...state, historyImport: { ...(state.historyImport as object), status: "pending" } });
    expect(() => importHistory(input, projectRoot, () => undefined)).toThrow(/incomplete or conflicting import already occupies/);
    expect(store.readStateSnapshotRequired(statePath).historyImport).toMatchObject({ digest: historyDigest(input), status: "pending" });
  });

  it("leaves an interrupted pending receipt after admission failure and does not retry it", () => {
    const input = document();
    let checks = 0;
    expect(() => importHistory(input, projectRoot, () => {
      checks += 1;
      return checks > 1 ? "workspace changed during import" : undefined;
    })).toThrow(/completion is unverified/);
    expect(checks).toBeGreaterThan(1);
    const store = new SessionStoreAccess();
    const digest = historyDigest(input);
    const id = store.listSessions().find((entry) => entry.id.startsWith("sess_import_"))?.id;
    expect(id).toBeDefined();
    const state = store.readStateSnapshotRequired(store.statePath(id!));
    expect(state.historyImport).toMatchObject({ digest, status: "pending" });
    expect(() => importHistory(input, projectRoot, () => undefined)).toThrow(/incomplete or conflicting import already occupies/);
  });
});
