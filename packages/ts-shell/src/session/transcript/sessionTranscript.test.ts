import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createMessageTranscriptEvent } from "../sessionEventCodec.js";
import type { Session } from "../schema/sessionRecord.js";
import {
  appendBranchSummaryEvent,
  appendSessionTurn,
  appendTranscriptEvent,
  projectTranscriptMessages,
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

      expect(projectTranscriptMessages(readTranscriptEvents(transcriptPath))).toEqual([
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

      expect(projectTranscriptMessages(readTranscriptEvents(transcriptPath))).toEqual([
        {
          role: "user",
          content: "try approach A",
          timestamp: "2026-05-28T00:00:00.000Z",
        },
        {
          role: "user",
          content: "[Earlier Path]\nApproach A was rejected because it broke the parser.",
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

    expect(session.turns).toEqual([
      {
        role: "user",
        content: "hello",
        timestamp: "2026-05-28T00:00:02.000Z",
      },
    ]);
    expect(events).toEqual(["append", "metadata", "state"]);
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
