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
  const originalHome = process.env.HOME;
  const originalUserProfile = process.env.USERPROFILE;
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

    const layout = createSessionStoreLayout(home);
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
    if (originalUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = originalUserProfile;
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
  });

  function readExported(name: string): Record<string, unknown>[] {
    return fs
      .readFileSync(path.join(workdir, name), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
  }

  it("exports jsonl opening with a header, then the transcript entries", async () => {
    const result = await runExportCommand(["jsonl", "out.jsonl"], context());
    expect(result.kind).toBe("local");

    const lines = readExported("out.jsonl");
    // The header goes first so a reader knows the format before reading entries.
    // A file that leaves this machine and is read later has to answer that.
    expect(lines[0]).toMatchObject({ type: "session", version: expect.any(Number) });
    expect(typeof lines[0]!.id).toBe("string");

    const entries = lines.slice(1);
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

  it("names the transcript's own format version rather than this build's", async () => {
    // A transcript written with a header reports the version on it.
    await runExportCommand(["jsonl", "out.jsonl"], context());
    const headed = readExported("out.jsonl")[0];
    expect(headed).toMatchObject({ type: "session", version: 1 });

    // A transcript from an older build has content and no header, and reports 0:
    // nobody wrote a version on it, and claiming the current one would say its
    // lines are in a shape they never had.
    const session = locateExistingSessionLayout(createSessionStoreLayout(home), sessionId);
    fs.writeFileSync(
      session.transcriptPath,
      `${JSON.stringify({ type: "message", id: "msg_old", role: "user", content: "old", timestamp: "t0" })}\n`,
      "utf8",
    );
    await runExportCommand(["jsonl", "legacy.jsonl"], context());
    const legacy = readExported("legacy.jsonl");
    expect(legacy[0]).toMatchObject({ type: "session", version: 0 });
    // The entries are still exported behind it.
    expect(legacy).toHaveLength(2);
  });

  it("reports the entry count without counting the header as one", async () => {
    const result = await runExportCommand(["jsonl", "out.jsonl"], context());
    // Four entries, three projected messages: the report must not disagree with
    // what the file holds, and the header is not an entry.
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
  it("refuses a relative path that would climb out, and writes nothing", async () => {
    // The defect this replaces resolved the path and wrote it, so a mistyped
    // destination overwrote a file outside the workspace while reporting a
    // successful export.
    const escapePath = path.join(workdir, "..", "escaped-export.md");
    fs.rmSync(escapePath, { force: true });

    const result = await runExportCommand(["markdown", "../escaped-export.md"], context());

    expect(result.kind === "local" && result.output).toContain("Nothing was exported");
    expect(fs.existsSync(escapePath)).toBe(false);
  });

  it("refuses an absolute path outside the workspace unless the intent is stated", async () => {
    const outside = path.join(os.tmpdir(), `outside-export-${Date.now()}.md`);
    fs.rmSync(outside, { force: true });

    const refused = await runExportCommand(["markdown", outside], context());
    expect(refused.kind === "local" && refused.output).toContain("Nothing was exported");
    expect(fs.existsSync(outside)).toBe(false);

    const allowed = await runExportCommand(["markdown", outside, "--outside"], context());
    expect(allowed.kind === "local" && allowed.output).toContain("Exported");
    expect(fs.existsSync(outside)).toBe(true);
    fs.rmSync(outside, { force: true });
  });
  it("refuses an unknown format instead of writing markdown into it", async () => {
    // This used to fall through to markdown, so `/export html out.html` wrote
    // markdown into a file named `.html` — which a browser parses as markup,
    // executing anything script-shaped the session ever contained.
    const out = path.join(workdir, "out.html");
    fs.rmSync(out, { force: true });

    const result = await runExportCommand(["csv", "out.html"], context());

    expect(result.kind === "local" && result.output).toContain("Unknown export format");
    expect(result.kind === "local" && result.output).toContain("Nothing was written");
    expect(fs.existsSync(out)).toBe(false);
  });

  it("writes a self-contained html page", async () => {
    const result = await runExportCommand(["html", "page.html"], context());

    expect(result.kind === "local" && result.output).toContain("Format: HTML");
    const html = fs.readFileSync(path.join(workdir, "page.html"), "utf8");
    // Self-contained: no stylesheet or script to fetch, so it opens offline.
    expect(html).toContain("<style>");
    expect(html).toContain('id="session-data"');
    expect(html).not.toContain("http://");
    expect(html).not.toContain("https://cdn");

    // The conversation is in the payload, not in the markup, so it appears once.
    const encoded = /<script id="session-data" type="text\/plain">([^<]*)<\/script>/.exec(html);
    expect(encoded).not.toBeNull();
    const payload = JSON.parse(Buffer.from(encoded![1]!, "base64").toString("utf8"));
    expect(payload.entries.length).toBeGreaterThan(0);
    expect(payload.leafId).toBeTruthy();
    expect(payload.tree.length).toBeGreaterThan(0);
  });
});
