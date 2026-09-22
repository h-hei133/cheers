import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runExportCommand } from "./exportCommandRuntime.js";
import {
  createSessionId,
  createSessionStoreLayout,
  ensureSessionStoreLayout,
  locateExistingSessionLayout,
} from "../../session/store/sessionFileLayout.js";
import {
  appendBranchSummaryEvent,
  appendCompactionEvent,
  appendTranscriptEvent,
} from "../../session/transcript/sessionTranscript.js";
import { createMessageTranscriptEvent } from "../../session/sessionEventCodec.js";
import type { CommandContext } from "./types.js";

/**
 * /export, against a real session directory.
 *
 * The two formats read different things on purpose: Markdown projects the
 * transcript into messages, JSONL writes the entries as recorded. The test that
 * matters is the second — a projection folds compaction and branch-summary
 * entries away, so exporting the projection loses the record of what was
 * compacted and what was stepped back past.
 */
describe("export command", () => {
  let home: string;
  let workdir: string;
  let sessionId: string;

  function context(): CommandContext {
    return { cwd: workdir, sessionId } as CommandContext;
  }

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "export-home-"));
    workdir = fs.mkdtempSync(path.join(os.tmpdir(), "export-work-"));
    process.env.HOME = home;
    process.env.USERPROFILE = home;

    const layout = createSessionStoreLayout();
    ensureSessionStoreLayout(layout);
    sessionId = createSessionId();
    const session = locateExistingSessionLayout(layout, sessionId);
    fs.mkdirSync(session.sessionDir, { recursive: true });

    appendTranscriptEvent(
      session.transcriptPath,
      createMessageTranscriptEvent({ role: "user", content: "ask", timestamp: "t1" }),
    );
    appendCompactionEvent(session.transcriptPath, {
      summary: "context was compacted",
      keptMessages: 0,
      timestamp: "t2",
    });
    appendBranchSummaryEvent(session.transcriptPath, {
      summary: "went down another path",
      droppedTurns: 2,
      timestamp: "t3",
    });
    appendTranscriptEvent(
      session.transcriptPath,
      createMessageTranscriptEvent({ role: "assistant", content: "answer", timestamp: "t4" }),
    );
  });

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(workdir, { recursive: true, force: true });
  });

  function readExported(name: string): Record<string, unknown>[] {
    return fs
      .readFileSync(path.join(workdir, name), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
  }

  it("exports jsonl as the transcript entries, keeping compaction and branch summaries", async () => {
    const result = await runExportCommand(["jsonl", "out.jsonl"], context());
    expect(result.kind).toBe("local");

    const entries = readExported("out.jsonl");
    expect(entries.map((entry) => entry.type)).toEqual([
      "message",
      "compaction",
      "branch_summary",
      "message",
    ]);
    // Entry identity is what a reader needs to refer back to a line.
    expect(entries.every((entry) => typeof entry.id === "string" && entry.id !== "")).toBe(true);
    expect(entries[1]).toMatchObject({ summary: "context was compacted" });
    expect(entries[2]).toMatchObject({ summary: "went down another path" });
  });

  it("reports the entry count for jsonl rather than a message count", async () => {
    const result = await runExportCommand(["jsonl", "out.jsonl"], context());
    // Four entries, three projected messages: the report must not disagree with
    // what the file holds.
    expect(result.kind === "local" && result.output).toContain("4 transcript entries");
  });

  it("exports markdown as the projected conversation", async () => {
    const result = await runExportCommand([], context());
    expect(result.kind === "local" && result.output).toContain("3 messages");

    const markdown = fs.readFileSync(
      path.join(workdir, fs.readdirSync(workdir).find((name) => name.endsWith(".md"))!),
      "utf8",
    );
    expect(markdown).toContain("answer");
    // The projection folds both entry kinds in as context, which is right for a
    // reader: the compaction checkpoint replaces what came before it, and the
    // branch summary arrives as a note.
    expect(markdown).toContain("context was compacted");
    expect(markdown).toContain("went down another path");
    // "ask" preceded the checkpoint and `keptMessages` was 0, so the projection
    // drops it — the file holds the folded view, not the raw transcript.
    expect(markdown).not.toContain("ask");
  });
});
