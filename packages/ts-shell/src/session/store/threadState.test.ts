import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type { Session } from "../schema/sessionRecord.js";
import { createSessionStoreLayout, projectSessionFileLayout } from "./sessionFileLayout.js";
import { loadSessionRecord, writeSessionRecord } from "./sessionStore.js";
import {
  addDurableSessionCompaction,
  appendDurableSessionChild,
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

      appendDurableSessionChild({
        session,
        layout,
        messageRole: "assistant",
        timestamp: "2026-06-02T00:00:02.000Z",
        entryId: "sess_thread_store:turn-2",
        parentEntryId: "sess_thread_store:turn-1",
      });
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
