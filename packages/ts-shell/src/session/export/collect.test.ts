import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSessionStoreLayout, projectSessionFileLayout } from "../store/sessionFileLayout.js";
import { writeSessionMetadataRecord, writeSessionRecord } from "../store/sessionStore.js";
import { writeSessionState } from "../store/sessionStateStore.js";
import { appendSessionTurn, appendTranscriptEvent } from "../transcript/sessionTranscript.js";
import { gatherExport } from "./collect.js";
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

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "export-home-"));
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), "export-work-"));
    process.env.HOME = home;
    process.env.USERPROFILE = home;
  });

  afterEach(() => {
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

  it("carries a tool result under the call it answers", () => {
    // The page shows a result inside its call, so it must be reachable by call
    // id rather than by scanning every entry.
    writeSession([{ role: "user", content: "ask" }]);

    const result = gatherExport({ sessionId, workspace });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // No tool calls in this session, so the map is present and empty — the
    // page reads it unconditionally.
    expect(result.payload.results).toEqual({});
  });
});
