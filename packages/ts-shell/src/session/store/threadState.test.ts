import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type { Session } from "../schema/sessionRecord.js";
import { createSessionStoreLayout, projectSessionFileLayout } from "./sessionFileLayout.js";
import { loadSessionRecord, writeSessionRecord } from "./sessionStore.js";
import {
  appendTranscriptEvent,
  projectBranchMessages,
  readTranscriptEvents,
} from "../transcript/sessionTranscript.js";
import { createMessageTranscriptEvent } from "../sessionEventCodec.js";
import { sessionThreadPath } from "../schema/sessionThread.js";
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

describe("branching", () => {
  function seed(): { session: Session; layout: ReturnType<typeof projectSessionFileLayout>; home: string } {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "session-branch-"));
    const storeLayout = createSessionStoreLayout(home);
    const layout = projectSessionFileLayout({
      sessionsDir: storeLayout.sessionsDir,
      sessionId: "sess_branch",
    });
    const session: Session = {
      id: "sess_branch",
      projectRoot: "/repo",
      createdAt: "2026-06-03T00:00:00.000Z",
      updatedAt: "2026-06-03T00:00:01.000Z",
      status: "active",
      turns: [
        { id: "t1", role: "user", content: "one", timestamp: "2026-06-03T00:00:01.000Z" },
        { id: "t2", role: "assistant", content: "two", timestamp: "2026-06-03T00:00:02.000Z" },
      ],
    };
    writeSessionRecord({ session, layout });
    writeSessionState({ session, layout });
    // The transcript is what holds the content, so a branch test has to have one.
    for (const turn of session.turns) {
      appendTranscriptEvent(layout.transcriptPath, createMessageTranscriptEvent(turn as never));
    }
    return { session, layout, home };
  }

  it("resolves the branch in view from the active leaf", () => {
    const { session, layout, home } = seed();
    try {
      const thread = readSessionThreadSnapshot({ session, layout });
      const path = sessionThreadPath(thread);
      expect(path.resolved).toBe(true);
      expect(path.path.map((entry) => entry.id)).toEqual([
        "sess_branch:root",
        "t1",
        "t2",
      ]);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("keeps both branches when a new turn is added after going back", () => {
    // The point of the tree: work stepped away from is kept, not erased.
    const { session, layout, home } = seed();
    try {
      switchDurableSessionActiveLeaf({ session, layout, leafEntryId: "t1" });

      // Continue in the other direction.
      session.turns.push({
        id: "t3",
        role: "user",
        content: "another way",
        timestamp: "2026-06-03T00:00:03.000Z",
      });
      writeSessionState({ session, layout });

      const thread = readSessionThreadSnapshot({ session, layout });
      const ids = thread.entries.map((entry) => entry.id);
      // Every entry survives: the abandoned `t2` as well as the new `t3`.
      expect(ids).toEqual(["sess_branch:root", "t1", "t2", "t3"]);
      expect(sessionThreadPath(thread).path.map((entry) => entry.id)).toEqual([
        "sess_branch:root",
        "t1",
        "t3",
      ]);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("does not add a turn the tree already represents on another branch", () => {
    // Counting from the active branch's end would see one turn where the session
    // has three, and re-add the abandoned one under a new parent.
    const { session, layout, home } = seed();
    try {
      switchDurableSessionActiveLeaf({ session, layout, leafEntryId: "t1" });
      session.turns.push({
        id: "t3",
        role: "user",
        content: "another way",
        timestamp: "2026-06-03T00:00:03.000Z",
      });
      writeSessionState({ session, layout });
      const first = readSessionThreadSnapshot({ session, layout }).entries.length;

      // Every later write must leave it alone.
      writeSessionState({ session, layout });
      const second = readSessionThreadSnapshot({ session, layout }).entries.length;

      expect(second).toBe(first);
      expect(readSessionThreadSnapshot({ session, layout }).entries.map((e) => e.id)).toEqual([
        "sess_branch:root",
        "t1",
        "t2",
        "t3",
      ]);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("counts turns on the branch in view, not across the tree", () => {
    // Counting every entry would compare abandoned work against the session's
    // turns and invent entries for turns that are not missing.
    const { session, layout, home } = seed();
    try {
      switchDurableSessionActiveLeaf({ session, layout, leafEntryId: "t1" });
      session.turns.push({
        id: "t3",
        role: "user",
        content: "another way",
        timestamp: "2026-06-03T00:00:03.000Z",
      });
      // Three turns recorded, two of them on this branch.
      writeSessionState({ session, layout });

      const once = readSessionThreadSnapshot({ session, layout });
      writeSessionState({ session, layout });
      const twice = readSessionThreadSnapshot({ session, layout });

      expect(twice.entries.length).toBe(once.entries.length);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("loads only the branch in view", () => {
    // The load path is what the rest of the product reads, so the projection has
    // to be wired into it rather than only being available.
    const { session, layout, home } = seed();
    try {
      switchDurableSessionActiveLeaf({ session, layout, leafEntryId: "t1" });
      const next = {
        id: "t3",
        role: "user" as const,
        content: "another way",
        timestamp: "2026-06-03T00:00:03.000Z",
      };
      session.turns.push(next);
      appendTranscriptEvent(layout.transcriptPath, createMessageTranscriptEvent(next));
      writeSessionState({ session, layout });

      expect(
        loadSessionRecord({ sessionId: session.id, layout, cwd: "/repo" }).turns.map(
          (turn) => turn.content,
        ),
      ).toEqual(["one", "another way"]);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("keeps a session whose thread does not describe its transcript", () => {
    // A thread written against a transcript that recorded no ids names none of
    // its messages. Filtering by it would return nothing, and an empty
    // conversation reads as "this session said nothing" rather than "these two
    // files disagree".
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "session-mismatch-"));
    try {
      const storeLayout = createSessionStoreLayout(home);
      const layout = projectSessionFileLayout({
        sessionsDir: storeLayout.sessionsDir,
        sessionId: "sess_legacy",
      });
      const session: Session = {
        id: "sess_legacy",
        projectRoot: "/repo",
        createdAt: "2026-06-04T00:00:00.000Z",
        updatedAt: "2026-06-04T00:00:01.000Z",
        status: "active",
        turns: [],
      };
      writeSessionRecord({ session, layout });
      // Transcript lines with no ids, as an older build wrote them.
      fs.writeFileSync(
        layout.transcriptPath,
        [
          JSON.stringify({ type: "message", role: "user", content: "old one", timestamp: "t1" }),
          JSON.stringify({ type: "message", role: "assistant", content: "old two", timestamp: "t2" }),
        ].join("\n") + "\n",
        "utf8",
      );
      writeSessionState({ session, layout });

      expect(
        loadSessionRecord({ sessionId: session.id, layout, cwd: "/repo" }).turns.map(
          (turn) => turn.content,
        ),
      ).toEqual(["old one", "old two"]);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("falls back to the whole transcript for a session with no thread", () => {
    const { session, layout, home } = seed();
    try {
      const events = readTranscriptEvents(layout.transcriptPath);
      expect(projectBranchMessages(events, undefined).map((m) => m.content)).toEqual([
        "one",
        "two",
      ]);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("projects only the branch in view", () => {
    const { session, layout, home } = seed();
    try {
      const events = readTranscriptEvents(layout.transcriptPath);
      expect(projectBranchMessages(events, ["sess_branch:root", "t1"]).map((m) => m.content)).toEqual([
        "one",
      ]);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});
