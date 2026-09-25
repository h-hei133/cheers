import { describe, expect, it } from "vitest";
import {
  createMessageTranscriptEvent,
  decodeTranscriptLineSafe,
  encodeTranscriptEvent,
  type TranscriptEvent,
} from "./sessionEventCodec.js";
import { readTranscriptEvents } from "./transcript/sessionTranscript.js";
import type { MultimodalContentBlock } from "../model-adapters/multimodal.js";

/**
 * A recorded message survives being written and read back.
 *
 * This is the test that matters for messages carrying an image, and the reason
 * is that the failure is silent. `decodeTranscriptLineSafe` returns nothing for a
 * line it cannot validate, and the loader skips what it cannot read — so a reader
 * that did not accept the new shape would not report an error, it would lose the
 * message on the next load. The type layer cannot catch that: the writer and the
 * reader disagree at runtime.
 */

const IMAGE: MultimodalContentBlock = { type: "image", data: "aGVsbG8=", mimeType: "image/png" };

describe("a transcript entry round-trips", () => {
  it("keeps a plain text message", () => {
    const event = createMessageTranscriptEvent({
      role: "user",
      content: "just words",
      timestamp: "2026-09-25T00:00:01.000Z",
    });

    // Through the validating reader, which is the one that decides whether a
    // line is readable at all — `decodeTranscriptLine` is an unchecked cast and
    // would pass whatever it was given.
    const back = decodeTranscriptLineSafe(encodeTranscriptEvent(event));

    expect(back?.type === "message" && back.content).toBe("just words");
  });

  it("keeps a message that carries an image", () => {
    // The case the widening exists for. Losing it here would lose the picture
    // from the conversation with nothing to say why.
    const event = createMessageTranscriptEvent({
      role: "user",
      content: [{ type: "text", text: "what is this?" }, IMAGE],
      timestamp: "2026-09-25T00:00:02.000Z",
    });

    const back = decodeTranscriptLineSafe(encodeTranscriptEvent(event));

    expect(back?.type).toBe("message");
    expect(back?.type === "message" && back.content).toEqual([
      { type: "text", text: "what is this?" },
      IMAGE,
    ]);
  });

  it("keeps a message that is only an image", () => {
    const event = createMessageTranscriptEvent({
      role: "user",
      content: [IMAGE],
      timestamp: "2026-09-25T00:00:03.000Z",
    });

    const back = decodeTranscriptLineSafe(encodeTranscriptEvent(event));
    expect(back?.type === "message" && back.content).toEqual([IMAGE]);
  });

  it("reads an entry written before images existed", () => {
    // Every transcript on disk today holds strings, and they stay valid.
    const legacy = JSON.stringify({
      type: "message",
      id: "turn_legacy",
      role: "user",
      content: "written by an older build",
      timestamp: "2026-09-25T00:00:04.000Z",
    });

    expect(decodeTranscriptLineSafe(legacy)).toMatchObject({
      content: "written by an older build",
    });
  });
});

describe("a transcript entry that cannot be read", () => {
  it("is refused rather than read as something else", () => {
    // A block of an unknown type is not a message this build understands, and
    // reading it as one would put a shape downstream code does not expect into
    // the conversation.
    const bad = JSON.stringify({
      type: "message",
      id: "turn_bad",
      role: "user",
      content: [{ type: "video", data: "x" }],
      timestamp: "2026-09-25T00:00:05.000Z",
    });

    expect(decodeTranscriptLineSafe(bad)).toBeUndefined();
  });

  it("refuses an image block missing its media type", () => {
    const bad = JSON.stringify({
      type: "message",
      id: "turn_bad2",
      role: "user",
      content: [{ type: "image", data: "aGVsbG8=" }],
      timestamp: "2026-09-25T00:00:06.000Z",
    });

    expect(decodeTranscriptLineSafe(bad)).toBeUndefined();
  });
});

describe("reading a transcript file", () => {
  it("keeps an image message alongside the text around it", () => {
    // End to end through the file reader, which is where a dropped line would
    // actually go missing.
    const fs = require("node:fs") as typeof import("node:fs");
    const os = require("node:os") as typeof import("node:os");
    const path = require("node:path") as typeof import("node:path");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codec-"));
    const file = path.join(dir, "transcript.jsonl");

    const events: TranscriptEvent[] = [
      createMessageTranscriptEvent({ role: "user", content: "before", timestamp: "t1" }),
      createMessageTranscriptEvent({
        role: "user",
        content: [{ type: "text", text: "look" }, IMAGE],
        timestamp: "t2",
      }),
      createMessageTranscriptEvent({ role: "assistant", content: "after", timestamp: "t3" }),
    ];
    fs.writeFileSync(file, events.map((event) => `${encodeTranscriptEvent(event)}\n`).join(""), "utf8");

    const read = readTranscriptEvents(file);

    expect(read).toHaveLength(3);
    const middle = read[1]!;
    expect(middle.type === "message" && middle.content).toEqual([
      { type: "text", text: "look" },
      IMAGE,
    ]);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
