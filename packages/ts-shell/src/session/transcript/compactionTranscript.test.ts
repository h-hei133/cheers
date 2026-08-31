import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  appendCompactionEvent,
  appendTranscriptEvent,
  projectTranscriptMessages,
  readTranscriptEvents,
} from "./sessionTranscript.js";
import { createMessageTranscriptEvent } from "../sessionEventCodec.js";

describe("Compaction Transcript Persistence & Projection", () => {
  let tempDir: string;
  let transcriptPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "compaction-transcript-test-"));
    transcriptPath = path.join(tempDir, "transcript.jsonl");
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup
    }
  });

  it("appends and reads back structured tool calls and compaction entries", () => {
    appendTranscriptEvent(
      transcriptPath,
      createMessageTranscriptEvent({
        role: "user",
        content: "Please build feature",
        timestamp: "2026-08-31T08:00:00.000Z",
      }),
    );

    appendTranscriptEvent(
      transcriptPath,
      createMessageTranscriptEvent({
        role: "assistant",
        content: "Calling tool",
        tool_calls: [
          {
            id: "call_read_1",
            type: "function",
            function: { name: "read", arguments: '{"path":"main.ts"}' },
          },
        ],
        timestamp: "2026-08-31T08:00:01.000Z",
      }),
    );

    appendCompactionEvent(transcriptPath, {
      summary: "Completed initial file inspection. Moving to edit phase.",
      firstKeptEntryId: "entry_tail_1",
      tokensBefore: 45000,
      timestamp: "2026-08-31T08:05:00.000Z",
    });

    appendTranscriptEvent(
      transcriptPath,
      createMessageTranscriptEvent({
        role: "user",
        content: "Proceed with the edit",
        timestamp: "2026-08-31T08:06:00.000Z",
      }),
    );

    const events = readTranscriptEvents(transcriptPath);
    expect(events.length).toBe(4);
    expect(events[2].type).toBe("compaction");

    const messages = projectTranscriptMessages(events);
    expect(messages.length).toBe(2);
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toContain("[Context Checkpoint]");
    expect(messages[1].content).toBe("Proceed with the edit");
  });
});
