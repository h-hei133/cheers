import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runEntriesCommand } from "./entriesCommandRuntime.js";
import {
  createSessionStoreLayout,
  projectSessionFileLayout,
} from "../../session/store/sessionFileLayout.js";
import { appendTranscriptEvent, appendSessionTurn } from "../../session/transcript/sessionTranscript.js";
import { writeSessionMetadataRecord, writeSessionRecord } from "../../session/store/sessionStore.js";
import { writeSessionState } from "../../session/store/sessionStateStore.js";
import type { Session } from "../../session/schema/sessionRecord.js";
import type { CommandContext } from "./types.js";

/**
 * /entries, against a real session directory.
 *
 * What makes this a contract rather than a listing is the cursor: a client passes
 * the last id it handled and gets only what came after. The case worth testing is
 * the one where the two possible answers mean opposite things — an empty list says
 * "nothing new" and a cursor from elsewhere says "starting here would skip
 * everything in between", so they cannot share a result.
 */
describe("entries command", () => {
  let home: string;
  let workdir: string;
  const sessionId = "sess_entries_command";
  let ids: string[] = [];

  function context(): CommandContext {
    return { cwd: workdir, sessionId } as CommandContext;
  }

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "entries-home-"));
    workdir = fs.mkdtempSync(path.join(os.tmpdir(), "entries-work-"));
    process.env.HOME = home;
    process.env.USERPROFILE = home;

    // Written through the store, the way a real session is, so the fixture has the
    // metadata and state files the loader requires. Writing only a transcript
    // produced a session the command could not read at all, which is what made
    // every assertion below fail for the wrong reason.
    const storeLayout = createSessionStoreLayout(home);
    const layout = projectSessionFileLayout({ sessionsDir: storeLayout.sessionsDir, sessionId });
    const session: Session = {
      id: sessionId,
      projectRoot: workdir,
      createdAt: "2026-09-24T00:00:00.000Z",
      updatedAt: "2026-09-24T00:00:03.000Z",
      status: "active",
      turns: [
        { role: "user", content: "first", timestamp: "2026-09-24T00:00:01.000Z" },
        { role: "assistant", content: "second", timestamp: "2026-09-24T00:00:02.000Z" },
        { role: "user", content: "third", timestamp: "2026-09-24T00:00:03.000Z" },
      ],
    };
    writeSessionRecord({ session, layout });

    // Recorded through the same path the product uses, so the turns carry the ids
    // the transcript does. Hand-writing the transcript gave the turns no ids at
    // all, and the cursor — which is the whole point of this command — had nothing
    // to name.
    const recorded: Session = { ...session, turns: [] };
    for (const turn of session.turns) {
      appendSessionTurn({
        session: recorded,
        message: { role: turn.role, content: turn.content },
        timestamp: turn.timestamp,
        append: (event) => appendTranscriptEvent(layout.transcriptPath, event),
        writeMetadata: (next) => writeSessionMetadataRecord({ session: next, layout }),
        writeState: (next) => writeSessionState({ session: next, layout }),
      });
    }
    ids = recorded.turns.map((turn) => turn.id).filter((id): id is string => id !== undefined);
  });

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(workdir, { recursive: true, force: true });
    delete process.env.HOME;
    delete process.env.USERPROFILE;
  });

  it("lists every entry in append order", async () => {
    const result = await runEntriesCommand([], context());
    expect(result.output).toContain("| Entry | Type | When |");
    for (const id of ids) expect(result.output).toContain(`\`${id}\``);
  });

  it("returns only what follows the cursor", async () => {
    // Exclusive: a client that passes the last id it handled must not see it again,
    // or it never makes progress.
    const result = await runEntriesCommand([ids[0]!], context());
    expect(result.output).not.toContain(`\`${ids[0]}\``);
    expect(result.output).toContain(`\`${ids[1]}\``);
    expect(result.output).toContain(`\`${ids[2]}\``);
  });

  it("says nothing follows the last entry", async () => {
    const result = await runEntriesCommand([ids[2]!], context());
    expect(result.output).toContain("No entries after that cursor");
  });

  it("refuses a cursor that is not from this session", async () => {
    // An empty list would read as "nothing new" and a client would carry on with a
    // cursor that is not in this session at all.
    const result = await runEntriesCommand(["nope"], context());
    expect(result.output).toContain("No entry with id `nope`");
    expect(result.output).toContain("silently skip");
  });

  it("renders the tree with nesting and the leaf", async () => {
    const result = await runEntriesCommand(["tree"], context());
    expect(result.output).toContain("Session tree");
    // Nested, so a reader can see which entry follows which.
    expect(result.output).toMatch(/- `[^`]+` user\n\s+- /);
  });

  it("narrows the tree to one entry's subtree", async () => {
    const result = await runEntriesCommand(["tree", ids[1]!], context());
    expect(result.output).toContain(`\`${ids[1]}\``);
    expect(result.output).not.toContain(`\`${ids[0]}\``);
  });

  it("explains itself on help", async () => {
    const result = await runEntriesCommand(["help"], context());
    expect(result.output).toContain("/entries <id>");
  });

  it("says so when there is no session", async () => {
    const result = await runEntriesCommand([], { cwd: workdir } as CommandContext);
    expect(result.output).toContain("needs a live session");
  });
});
