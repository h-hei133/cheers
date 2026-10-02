import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TRANSCRIPT_FORMAT_VERSION, createMessageTranscriptEvent, createTranscriptHeader } from "../sessionEventCodec.js";
import type { Session } from "../schema/sessionRecord.js";
import {
  appendBranchSummaryEvent,
  appendSessionTurn,
  appendTranscriptEvent,
  projectBranchMessages,
  projectTranscriptMessages,
  readTranscript,
  readTranscriptEvents,
} from "./sessionTranscript.js";

describe("sessionTranscript", () => {
  it("preserves append order and message projection", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "session-transcript-"));
    try {
      const transcriptPath = path.join(root, "transcript.jsonl");
      appendTranscriptEvent(
        transcriptPath,
        createMessageTranscriptEvent({
          role: "user",
          content: "first",
          timestamp: "2026-05-28T00:00:00.000Z",
        }),
      );
      appendTranscriptEvent(
        transcriptPath,
        createMessageTranscriptEvent({
          role: "assistant",
          content: "second",
          timestamp: "2026-05-28T00:00:01.000Z",
        }),
      );

      // The id travels with the message: a branch is a set of these ids, so a
      // projection that dropped them could not be filtered to one branch.
      const projected = projectTranscriptMessages(readTranscriptEvents(transcriptPath));
      expect(projected.map(({ id, ...rest }) => rest)).toEqual([
        {
          role: "user",
          content: "first",
          timestamp: "2026-05-28T00:00:00.000Z",
        },
        {
          role: "assistant",
          content: "second",
          timestamp: "2026-05-28T00:00:01.000Z",
        },
      ]);
      expect(projected.every((message) => typeof message.id === "string")).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("carries a branch summary forward as context after a rewind", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "session-transcript-branch-"));
    try {
      const transcriptPath = path.join(root, "transcript.jsonl");
      appendTranscriptEvent(
        transcriptPath,
        createMessageTranscriptEvent({
          role: "user",
          content: "try approach A",
          timestamp: "2026-05-28T00:00:00.000Z",
        }),
      );
      appendBranchSummaryEvent(transcriptPath, {
        summary: "Approach A was rejected because it broke the parser.",
        droppedTurns: 2,
        timestamp: "2026-05-28T00:00:05.000Z",
      });

      expect(
        projectTranscriptMessages(readTranscriptEvents(transcriptPath)).map(
          ({ id, ...rest }) => rest,
        ),
      ).toEqual([
        {
          role: "user",
          content: "try approach A",
          timestamp: "2026-05-28T00:00:00.000Z",
        },
        {
          role: "user",
          content: "[Earlier Path]\nApproach A was rejected because it broke the parser.",
          metadata: { contextSummary: "branch" },
          timestamp: "2026-05-28T00:00:05.000Z",
        },
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps add-turn write-through order in the transcript owner", () => {
    const session: Session = {
      id: "sess_turn",
      projectRoot: "/repo",
      createdAt: "2026-05-28T00:00:00.000Z",
      updatedAt: "2026-05-28T00:00:00.000Z",
      status: "active",
      turns: [],
    };
    const events: string[] = [];

    appendSessionTurn({
      session,
      message: { role: "user", content: "hello" },
      timestamp: "2026-05-28T00:00:02.000Z",
      append: () => events.push("append"),
      writeMetadata: () => events.push("metadata"),
      writeState: () => events.push("state"),
    });

    expect(session.turns.map(({ id, ...rest }) => rest)).toEqual([
      {
        role: "user",
        content: "hello",
        timestamp: "2026-05-28T00:00:02.000Z",
      },
    ]);
    // Named on the way in, so the thread can point back at this turn.
    expect(typeof session.turns[0]?.id).toBe("string");
    expect(events).toEqual(["append", "metadata", "state"]);
  });
});

describe("entry identity", () => {
  it("gives every appended entry its own id", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "session-transcript-ids-"));
    try {
      const transcriptPath = path.join(root, "transcript.jsonl");
      appendTranscriptEvent(
        transcriptPath,
        createMessageTranscriptEvent({
          role: "user",
          content: "one",
          timestamp: "2026-05-28T00:00:00.000Z",
        }),
      );
      appendBranchSummaryEvent(transcriptPath, {
        summary: "went another way",
        droppedTurns: 1,
        timestamp: "2026-05-28T00:00:01.000Z",
      });

      const ids = readTranscriptEvents(transcriptPath).map((event) => event.id);
      expect(ids.every((id) => typeof id === "string" && id.length > 0)).toBe(true);
      // Two entries that could otherwise be told apart only by position.
      expect(new Set(ids).size).toBe(ids.length);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("names entries written before ids existed by their line, without rewriting the file", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "session-transcript-legacy-"));
    try {
      const transcriptPath = path.join(root, "transcript.jsonl");
      const original = [
        JSON.stringify({ type: "message", role: "user", content: "old", timestamp: "t1" }),
        JSON.stringify({ type: "message", role: "assistant", content: "older", timestamp: "t2" }),
      ].join("\n");
      fs.writeFileSync(transcriptPath, original, "utf8");

      expect(readTranscriptEvents(transcriptPath).map((event) => event.id)).toEqual([
        "line-1",
        "line-2",
      ]);
      // Derived, not stored: these files are append-only.
      expect(fs.readFileSync(transcriptPath, "utf8")).toBe(original);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps an id that was already recorded", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "session-transcript-keep-"));
    try {
      const transcriptPath = path.join(root, "transcript.jsonl");
      fs.writeFileSync(
        transcriptPath,
        JSON.stringify({ type: "message", id: "msg_written", role: "user", content: "hi", timestamp: "t1" }),
        "utf8",
      );
      expect(readTranscriptEvents(transcriptPath)[0]?.id).toBe("msg_written");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  /**
   * A header is not an entry, and it must not be counted as one. The derived name
   * an entry gets when it has no id comes from its position, so counting the
   * header would shift every such name by one — the same line would answer to a
   * different name depending on whether something happened to precede it.
   */
  it("does not let a header shift the derived name of the entries behind it", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "session-transcript-header-num-"));
    try {
      const withoutHeader = path.join(root, "plain.jsonl");
      const withHeader = path.join(root, "headed.jsonl");
      const entry = JSON.stringify({ type: "message", role: "user", content: "old", timestamp: "t1" });

      fs.writeFileSync(withoutHeader, `${entry}\n`, "utf8");
      fs.writeFileSync(
        withHeader,
        `${JSON.stringify(createTranscriptHeader({ sessionId: "s1", timestamp: "t0", cwd: "/w" }))}\n${entry}\n`,
        "utf8",
      );

      const plainId = readTranscriptEvents(withoutHeader)[0]?.id;
      const headedId = readTranscriptEvents(withHeader)[0]?.id;
      expect(plainId).toBe("line-1");
      expect(headedId).toBe(plainId);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports a header's version, and zero for a file that has none", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "session-transcript-version-"));
    try {
      const plain = path.join(root, "plain.jsonl");
      const headed = path.join(root, "headed.jsonl");
      const entry = JSON.stringify({ type: "message", role: "user", content: "hi", timestamp: "t1" });

      fs.writeFileSync(plain, `${entry}\n`, "utf8");
      fs.writeFileSync(
        headed,
        `${JSON.stringify(createTranscriptHeader({ sessionId: "s1", timestamp: "t0", cwd: "/w" }))}\n${entry}\n`,
        "utf8",
      );

      // Absence of a header is what an older transcript looks like, and saying
      // "0" is the honest answer: nobody wrote a version on it.
      expect(readTranscript(plain).version).toBe(0);
      expect(readTranscript(headed).version).toBe(TRANSCRIPT_FORMAT_VERSION);
      // The header is metadata about the file, not a turn in the conversation.
      expect(readTranscript(headed).events).toHaveLength(1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("starts a transcript with a header when the first entry is appended", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "session-transcript-append-header-"));
    try {
      const transcriptPath = path.join(root, "transcript.jsonl");
      appendTranscriptEvent(
        transcriptPath,
        createMessageTranscriptEvent({ role: "user", content: "hi", timestamp: "t1", id: "msg_a" }),
        { sessionId: "s1", timestamp: "t0", cwd: "/w" },
      );

      const lines = fs.readFileSync(transcriptPath, "utf8").trim().split("\n");
      expect(JSON.parse(lines[0]!)).toMatchObject({ type: "session", version: TRANSCRIPT_FORMAT_VERSION, id: "s1" });
      expect(readTranscriptEvents(transcriptPath).map((event) => event.id)).toEqual(["msg_a"]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("gives a header to a file that exists but holds nothing", () => {
    // A session created by an older build left a zero-byte file behind. It has
    // nothing to overwrite, so starting it properly is not a rewrite.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "session-transcript-empty-"));
    try {
      const transcriptPath = path.join(root, "transcript.jsonl");
      fs.writeFileSync(transcriptPath, "", "utf8");

      appendTranscriptEvent(
        transcriptPath,
        createMessageTranscriptEvent({ role: "user", content: "hi", timestamp: "t1", id: "msg_a" }),
        { sessionId: "s1", timestamp: "t0", cwd: "/w" },
      );

      expect(readTranscript(transcriptPath).version).toBe(TRANSCRIPT_FORMAT_VERSION);
      expect(readTranscriptEvents(transcriptPath).map((event) => event.id)).toEqual(["msg_a"]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  /**
   * The rule that keeps this compatible with append-only: a header is written
   * only where there is nothing to overwrite. A transcript from an older build
   * has content and no header, and it must stay exactly as it is.
   */
  it("does not put a header in front of a transcript that already has entries", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "session-transcript-no-rewrite-"));
    try {
      const transcriptPath = path.join(root, "transcript.jsonl");
      const original = `${JSON.stringify({ type: "message", role: "user", content: "old", timestamp: "t1" })}\n`;
      fs.writeFileSync(transcriptPath, original, "utf8");

      appendTranscriptEvent(transcriptPath, createMessageTranscriptEvent({ role: "assistant", content: "new", timestamp: "t2", id: "msg_b" }));

      const after = fs.readFileSync(transcriptPath, "utf8");
      expect(after.startsWith(original)).toBe(true);
      expect(readTranscript(transcriptPath).version).toBe(0);
      expect(readTranscriptEvents(transcriptPath).map((event) => event.id)).toEqual(["line-1", "msg_b"]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("corrupt transcript lines", () => {
  it("skips truncated and misshapen lines instead of failing the session", async () => {
    const { readTranscriptEvents } = await import("./sessionTranscript.js");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "session-transcript-corrupt-"));
    try {
      const file = path.join(root, "transcript.jsonl");
      fs.writeFileSync(
        file,
        [
          JSON.stringify({ type: "message", role: "user", content: "hi", timestamp: "t1" }),
          "{truncated",
          JSON.stringify({ type: "message", role: "user", timestamp: "t2" }),
          JSON.stringify([]),
          JSON.stringify({ type: "message", role: "assistant", content: "ok", timestamp: "t3" }),
        ].join("\n"),
        "utf8",
      );
      const events = readTranscriptEvents(file);
      expect(events.map((event) => (event.type === "message" ? event.content : event.type))).toEqual(["hi", "ok"]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("branch summaries and the branch they describe", () => {
  const message = (id: string, content: string) => ({
    type: "message" as const,
    id,
    role: "user" as const,
    content,
    timestamp: "2026-06-01T00:00:00.000Z",
  });
  const note = (abandonedEntryIds: readonly string[]) => ({
    type: "branch_summary" as const,
    id: `brsum_${abandonedEntryIds.join("_")}`,
    summary: "what was left behind",
    droppedTurns: abandonedEntryIds.length,
    toEntryId: "m1",
    abandonedEntryIds,
    timestamp: "2026-06-01T00:00:00.000Z",
  });

  it("applies on the branch the user moved to", () => {
    const events = [message("m1", "q1"), message("m2", "a1"), note(["m2"])];
    // Moving back to `m1` abandons `m2`, so the note describes where the reader is.
    const projected = projectBranchMessages(events, ["root", "m1"], ["root", "m1", "m2"]);

    expect(projected.some((turn) => turn.content.startsWith("[Earlier Path]"))).toBe(true);
  });

  it("does not reappear on the branch it was written about", () => {
    // Reading it there would tell the user what they stepped away from while they
    // were looking straight at it. Every note used to apply to every branch, so
    // going back to a branch showed its own abandonment note.
    const events = [message("m1", "q1"), message("m2", "a1"), note(["m2"])];
    const projected = projectBranchMessages(events, ["root", "m1", "m2"], ["root", "m1", "m2"]);

    expect(projected.map((turn) => turn.content)).toEqual(["q1", "a1"]);
  });

  it("keeps a note written before the abandoned turns were recorded", () => {
    // There is nothing to test it with, so it stays rather than being hidden.
    const events = [
      message("m1", "q1"),
      message("m2", "a1"),
      { type: "branch_summary" as const, id: "old", summary: "old note", droppedTurns: 1, timestamp: "2026-06-01T00:00:00.000Z" },
    ];
    const projected = projectBranchMessages(events, ["root", "m1", "m2"], ["root", "m1", "m2"]);

    expect(projected.some((turn) => turn.content.startsWith("[Earlier Path]"))).toBe(true);
  });

  it("adds no message for a move that had nothing to summarize", () => {
    const events = [
      message("m1", "q1"),
      { type: "branch_summary" as const, id: "empty", droppedTurns: 1, toEntryId: "m1", abandonedEntryIds: ["m2"], timestamp: "2026-06-01T00:00:00.000Z" },
    ];
    const projected = projectBranchMessages(events, ["root", "m1"], ["root", "m1", "m2"]);

    expect(projected.map((turn) => turn.content)).toEqual(["q1"]);
  });
});
