import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type { Session } from "../schema/sessionRecord.js";
import { createSessionStoreLayout, projectSessionFileLayout } from "./sessionFileLayout.js";
import { loadSessionRecord, writeSessionRecord } from "./sessionStore.js";
import { writeSessionState } from "./sessionStateStore.js";
import {
  addDurableSessionCompaction,
  createDurableSessionBranch,
  readSessionThreadSnapshot,
  switchDurableSessionActiveLeaf,
} from "./threadState.js";

describe("session thread state store", () => {
  it("persists branch switching and compaction facts without changing loaded session compatibility", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "session-thread-store-"));
    try {
      const storeLayout = createSessionStoreLayout(home);
      const layout = projectSessionFileLayout({
        sessionsDir: storeLayout.sessionsDir,
        sessionId: "sess_thread_store",
      });
      const session: Session = {
        id: "sess_thread_store",
        projectRoot: "/repo",
        createdAt: "2026-06-02T00:00:00.000Z",
        updatedAt: "2026-06-02T00:00:01.000Z",
        status: "active",
        turns: [{
          role: "user",
          content: "raw transcript stays in transcript only",
          timestamp: "2026-06-02T00:00:01.000Z",
        }],
      };
      writeSessionRecord({ session, layout });

      // The thread follows the session on its own: the turn recorded above has
      // an entry even though nothing wrote one.
      expect(readSessionThreadSnapshot({ session, layout })).toMatchObject({
        entries: [
          { id: "sess_thread_store:root", kind: "session-root" },
          { id: "sess_thread_store:turn-1", kind: "turn-message", role: "user" },
        ],
        activeLeafId: "sess_thread_store:turn-1",
      });

      // A turn recorded later is picked up, and the entry it gets is the one a
      // rebuild would have produced.
      session.turns.push({
        role: "assistant",
        content: "second",
        timestamp: "2026-06-02T00:00:02.000Z",
      });
      // The turn path writes the state as each turn lands, which is what carries
      // the thread forward.
      writeSessionState({ session, layout });
      const caughtUp = readSessionThreadSnapshot({ session, layout });
      expect(caughtUp.entries.map((entry) => entry.id)).toEqual([
        "sess_thread_store:root",
        "sess_thread_store:turn-1",
        "sess_thread_store:turn-2",
      ]);
      expect(caughtUp.activeLeafId).toBe("sess_thread_store:turn-2");

      // Reading again changes nothing.
      expect(readSessionThreadSnapshot({ session, layout }).entries).toHaveLength(3);

      // The file itself carries the turn, not just the reader: a later process
      // that loads the state directly must see the same history.
      expect(
        JSON.parse(fs.readFileSync(layout.statePath, "utf8")).thread.entries.map(
          (entry: { id: string }) => entry.id,
        ),
      ).toEqual([
        "sess_thread_store:root",
        "sess_thread_store:turn-1",
        "sess_thread_store:turn-2",
      ]);

      createDurableSessionBranch({
        session,
        layout,
        parentEntryId: "sess_thread_store:turn-1",
        leafEntryId: "sess_thread_store:turn-2",
        branchId: "branch:stored",
        createdAt: "2026-06-02T00:00:03.000Z",
      });
      switchDurableSessionActiveLeaf({
        session,
        layout,
        leafEntryId: "sess_thread_store:turn-2",
        branchId: "branch:stored",
      });
      addDurableSessionCompaction({
        session,
        layout,
        record: {
          compactionId: "compact-stored",
          sourceActivePath: [
            "sess_thread_store:root",
            "sess_thread_store:turn-1",
            "sess_thread_store:turn-2",
          ],
          retainedEntryIds: ["sess_thread_store:turn-2"],
          excludedEntryIds: ["sess_thread_store:turn-1"],
          retainedContextFacts: [{ factId: "retained:stored", status: "safe" }],
          excludedContextFacts: [{ factId: "excluded:stored", status: "unsafe" }],
          staleInputIds: [],
          unsafeInputIds: [],
          missingFactIds: [],
          unsupportedFactIds: [],
          firstRetainedEntryId: "sess_thread_store:turn-2",
          summaryAvailability: "available",
          summaryProvenance: "runtime-projected",
          createdAt: "2026-06-02T00:00:04.000Z",
        },
      });

      const thread = readSessionThreadSnapshot({ session, layout });
      expect(thread).toMatchObject({
        activeLeafId: "sess_thread_store:turn-2",
        activeBranchId: "branch:stored",
        branches: [{ branchId: "branch:stored" }],
        compactions: [{ compactionId: "compact-stored" }],
      });
      expect(JSON.parse(fs.readFileSync(layout.statePath, "utf8")).thread)
        .toMatchObject({
          activeLeafId: "sess_thread_store:turn-2",
          activeBranchId: "branch:stored",
        });
      expect(loadSessionRecord({
        sessionId: session.id,
        layout,
        cwd: "/fallback",
      })).toEqual(expect.objectContaining({
        id: session.id,
        turns: [],
      }));
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});
