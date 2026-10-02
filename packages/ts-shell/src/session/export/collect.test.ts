import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSessionStoreLayout, projectSessionFileLayout } from "../store/sessionFileLayout.js";
import { writeSessionMetadataRecord, writeSessionRecord } from "../store/sessionStore.js";
import { writeSessionState } from "../store/sessionStateStore.js";
import { appendSessionTurn, appendTranscriptEvent } from "../transcript/sessionTranscript.js";
import { gatherExport } from "./collect.js";
import { renderExportHtml } from "./html.js";
import type { Session } from "../schema/sessionRecord.js";

/**
 * A session gathered for export.
 *
 * The conversation and the tree live in different files — the transcript has no
 * parent pointers, and the tree has no message content — so the join is the part
 * worth testing. So is the scrubbing: an export is a file someone sends to
 * another person, and the failure mode is a credential leaving the machine.
 */

describe("gathering a session for export", () => {
  let home = "";
  let workspace = "";
  const sessionId = "sess_export_collect";
  const originalHome = process.env.HOME;
  const originalUserProfile = process.env.USERPROFILE;
  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "export-home-"));
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), "export-work-"));
    process.env.HOME = home;
    process.env.USERPROFILE = home;
  });

  afterEach(() => {
    if (originalUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = originalUserProfile;
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  /** A session written the way the product writes one, so the tree exists. */
  function writeSession(turns: readonly { role: "user" | "assistant"; content: string }[]): void {
    const storeLayout = createSessionStoreLayout(home);
    const layout = projectSessionFileLayout({ sessionsDir: storeLayout.sessionsDir, sessionId });
    const base: Session = {
      id: sessionId,
      projectRoot: workspace,
      createdAt: "2026-09-25T00:00:00.000Z",
      updatedAt: "2026-09-25T00:00:09.000Z",
      status: "active",
      turns: [],
    };
    writeSessionRecord({ session: base, layout });
    const recorded: Session = { ...base, turns: [] };
    let second = 1;
    for (const turn of turns) {
      const timestamp = `2026-09-25T00:00:0${second}.000Z`;
      second += 1;
      appendSessionTurn({
        session: recorded,
        message: { role: turn.role, content: turn.content },
        timestamp,
        append: (event) => appendTranscriptEvent(layout.transcriptPath, event),
        writeMetadata: (session) => writeSessionMetadataRecord({ session, layout }),
        writeState: (session) => writeSessionState({ session, layout }),
      });
    }
  }

  it("joins the tree to the messages by entry id", () => {
    // Neither file alone is enough: the transcript has no parents, the tree has
    // no content. The sidebar needs both, joined on the one field they share.
    writeSession([
      { role: "user", content: "first question" },
      { role: "assistant", content: "first answer" },
    ]);

    const result = gatherExport({ sessionId, workspace });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.entries).toHaveLength(2);
    expect(result.payload.tree.length).toBeGreaterThan(0);
    expect(result.payload.leafId).toBeTruthy();
  });

  it("exports a long chronological fallback without nested serialization limits", () => {
    writeSession([{ role: "user", content: "start" }]);
    const layout = projectSessionFileLayout({ sessionsDir: createSessionStoreLayout(home).sessionsDir, sessionId });
    const events = Array.from({ length: 4000 }, (_, index) => ({ type: "message", id: `entry-${index}`, role: "user", content: "short", timestamp: "2026-09-25T00:00:00.000Z" }));
    fs.writeFileSync(layout.transcriptPath, events.map(event => JSON.stringify(event)).join("\n") + "\n");
    fs.writeFileSync(layout.statePath, "broken state");
    const gathered = gatherExport({ sessionId, workspace });
    expect(gathered.ok).toBe(true);
    if (!gathered.ok) return;
    expect(() => renderExportHtml(gathered.payload)).not.toThrow();
    expect(gathered.payload.warnings).toContain("Branch history is unavailable; showing transcript order.");
  });

  it("reports skipped malformed lines instead of claiming a complete conversation", () => {
    writeSession([{ role: "user", content: "readable" }]);
    const layout = projectSessionFileLayout({ sessionsDir: createSessionStoreLayout(home).sessionsDir, sessionId });
    fs.appendFileSync(layout.transcriptPath, "{malformed\n");
    const gathered = gatherExport({ sessionId, workspace });
    expect(gathered.ok).toBe(true);
    if (!gathered.ok) return;
    expect(gathered.payload.warnings).toContain("1 unreadable transcript line was omitted.");
  });

  it("reports unsupported and duplicate headers without losing readable messages", () => {
    writeSession([{ role: "user", content: "readable" }]);
    const layout = projectSessionFileLayout({ sessionsDir: createSessionStoreLayout(home).sessionsDir, sessionId });
    fs.appendFileSync(layout.transcriptPath, JSON.stringify({ type: "session", id: sessionId, cwd: workspace, timestamp: "t", version: 999 }) + "\n");
    const result = gatherExport({ sessionId, workspace });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.entries).toHaveLength(1);
    expect(result.payload.warnings).toContain("An unexpected transcript header was found; file provenance is uncertain.");
    expect(result.payload.warnings).toContain("The transcript format version is unsupported; only recognized entries are shown.");
  });

  it("gives every tree node a preview so the sidebar reads without the body", () => {
    writeSession([
      { role: "user", content: "explain the health endpoint" },
      { role: "assistant", content: "It returns ok." },
    ]);

    const result = gatherExport({ sessionId, workspace });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const previews = JSON.stringify(result.payload.tree);
    expect(previews).toContain("explain the health endpoint");
  });

  it("removes a credential and keeps everything else", () => {
    // The two halves matter equally. A token must not survive the file, and the
    // conversation must — an export that scrubbed the answer would be useless,
    // which is why the report rules are not applied here.
    writeSession([
      { role: "user", content: "run: curl -H 'Authorization: Bearer sk-abcdefgh12345678' https://api.test" },
      { role: "assistant", content: "HTML follows:\n<html><body>hello</body></html>" },
    ]);

    const result = gatherExport({ sessionId, workspace });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const all = JSON.stringify(result.payload);
    expect(all).not.toContain("sk-abcdefgh12345678");
    // The report scrubber would have deleted this; an export must show it.
    expect(all).toContain("<html>");
  });

  it("refuses a session that does not exist rather than writing an empty file", () => {
    const result = gatherExport({ sessionId: "sess_absent", workspace });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain("not found");
  });

  it("scrubs structured credentials and metadata without merging entry identities", () => {
    writeSession([{ role: "user", content: "start" }]);
    const layout = projectSessionFileLayout({ sessionsDir: createSessionStoreLayout(home).sessionsDir, sessionId });
    const events = [
      { type: "message", id: "token=FAKE_ID_ONE", role: "assistant", timestamp: "token=FAKE_TIME", content: '{"password":"FAKE_JSON_SECRET","keep":"visible"}', origin: { model: "token=FAKE_MODEL", provider: "secret=FAKE_PROVIDER" }, tool_calls: [{ id: "token=FAKE_CALL", type: "function", function: { name: "token=FAKE_NAME", arguments: '{"api_key":"FAKE_ARGUMENT","path":"keep.txt"}' } }] },
      { type: "message", id: "token=FAKE_ID_TWO", role: "tool", timestamp: "t2", content: "result", tool_call_id: "token=FAKE_CALL" },
    ];
    fs.writeFileSync(layout.transcriptPath, events.map(event => JSON.stringify(event)).join("\n") + "\n");
    fs.writeFileSync(layout.statePath, "{}");
    const result = gatherExport({ sessionId, workspace: "token=FAKE_WORKSPACE" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(JSON.stringify(result.payload)).not.toContain("FAKE_");
    expect(result.payload.entries[0]!.content).toContain('"keep":"visible"');
    expect(result.payload.entries[0]!.toolCalls![0]!.arguments).toContain('"path":"keep.txt"');
    expect(result.payload.entries[0]!.id).not.toBe(result.payload.entries[1]!.id);
    expect(result.payload.entries[0]!.toolCalls![0]!.id).toBe(result.payload.entries[1]!.toolCallId);
    expect(result.payload.tree[1]!.parentId).toBe(result.payload.tree[0]!.id);
  });

  it.each([{ entries: {} }, { entries: [null] }, { entries: [{ id: "x" }, { id: "x" }] }])("degrades an invalid branch snapshot: %j", thread => {
    writeSession([{ role: "user", content: "readable" }]);
    const layout = projectSessionFileLayout({ sessionsDir: createSessionStoreLayout(home).sessionsDir, sessionId });
    fs.writeFileSync(layout.statePath, JSON.stringify({ thread }));
    const result = gatherExport({ sessionId, workspace });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.warnings).toContain("Branch history is unavailable; showing transcript order.");
    expect(result.payload.entries[0]!.content).toBe("readable");
  });

  it("refuses a session with no conversation recorded", () => {
    // A file with no conversation in it, described as an export of one, is the
    // failure this replaces.
    const storeLayout = createSessionStoreLayout(home);
    const layout = projectSessionFileLayout({ sessionsDir: storeLayout.sessionsDir, sessionId });
    writeSessionRecord({
      session: {
        id: sessionId,
        projectRoot: workspace,
        createdAt: "2026-09-25T00:00:00.000Z",
        updatedAt: "2026-09-25T00:00:00.000Z",
        status: "active",
        turns: [],
      },
      layout,
    });

    const result = gatherExport({ sessionId, workspace });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain("no conversation");
  });

  it("leaves result association to the selected path in the page", () => {
    writeSession([{ role: "user", content: "ask" }]);

    const result = gatherExport({ sessionId, workspace });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload).not.toHaveProperty("results");
  });
});
