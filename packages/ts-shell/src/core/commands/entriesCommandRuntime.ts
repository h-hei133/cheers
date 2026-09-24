import type { CommandContext, LocalCommandResult } from "./types.js";
import { createSessionStoreLayout, locateExistingSessionLayout } from "../../session/store/sessionFileLayout.js";
import { readTranscriptEvents } from "../../session/transcript/sessionTranscript.js";
import { readSessionThreadSnapshot } from "../../session/store/threadState.js";
import { loadSessionRecord } from "../../session/store/sessionStore.js";
import { readSessionEntries, readSessionTree } from "../../session/query/sessionEntries.js";
import type { TranscriptEvent } from "../../session/sessionEventCodec.js";
import type { SessionThreadSnapshot } from "../../session/schema/sessionThread.js";

/**
 * /entries — the session as entries, for something reading it from outside.
 *
 * The point is the cursor. A client that has to re-read the whole transcript to
 * find what it has not seen cannot keep up with a long session, and one that
 * remembers a file offset breaks the moment anything else appends. An entry id is
 * stable for the life of the session, so passing the last one handled is enough to
 * get exactly what came after it.
 *
 * The cursor is exclusive and an unknown one is an error rather than an empty
 * answer. To a synchronising client the two mean opposite things: "nothing new"
 * against "your cursor is from somewhere else, and starting here would silently
 * skip everything in between".
 *
 * What is listed is the file, not the conversation: pre-compaction history and
 * abandoned branches are in it. That is deliberate — a client tracking the session
 * wants the file, and `/export` is what a person wanting the conversation reads.
 */

/** Where this session's transcript lives, or nothing when it has none. */
function transcriptFor(sessionId: string): readonly TranscriptEvent[] {
  try {
    const layout = locateExistingSessionLayout(createSessionStoreLayout(), sessionId);
    return readTranscriptEvents(layout.transcriptPath);
  } catch {
    return [];
  }
}

/**
 * The session's thread, or nothing when it cannot be read.
 *
 * Loaded through the store rather than assembled here: the snapshot's catch-up step
 * reconciles the recorded thread against the session's turns, so it needs the real
 * record. Handing it a stub with only an id threw on the first read — the failure
 * that made `/entries tree` report an internal error instead of a tree.
 */
function threadFor(sessionId: string, cwd: string): SessionThreadSnapshot | undefined {
  try {
    const layout = locateExistingSessionLayout(createSessionStoreLayout(), sessionId);
    const session = loadSessionRecord({ sessionId, layout, cwd });
    return readSessionThreadSnapshot({ session, layout });
  } catch {
    return undefined;
  }
}

function leafIdFor(sessionId: string, cwd: string): string | null {
  return threadFor(sessionId, cwd)?.activeLeafId ?? null;
}

const HELP = [
  "### Entries",
  "",
  "Read this session's entries, optionally only those after a cursor.",
  "",
  "- `/entries` — every entry, in append order",
  "- `/entries <id>` — only the entries after `<id>`",
  "- `/entries tree` — the entries as a tree, including abandoned branches",
  "- `/entries tree <id>` — the subtree under `<id>`",
].join("\n");

export async function runEntriesCommand(
  args: string[],
  context: CommandContext,
): Promise<LocalCommandResult> {
  const sessionId = context.sessionId;
  if (!sessionId) {
    return { kind: "local", output: "No session to read: this command needs a live session." };
  }
  const [first, second] = args;

  if (first === "help" || first === "--help") {
    return { kind: "local", output: HELP };
  }

  if (first === "tree") {
    const snapshot = threadFor(sessionId, context.cwd);
    if (!snapshot) return { kind: "local", output: emptySession(sessionId) };
    const tree = readSessionTree(snapshot.entries, second);
    if (tree === "unknown-cursor") return { kind: "local", output: unknownCursor(second!) };
    if (tree.length === 0) return { kind: "local", output: emptySession(sessionId) };
    const lines = ["### Session tree", "", `Leaf: \`${snapshot.activeLeafId ?? "none"}\``, ""];
    const render = (nodes: typeof tree, depth: number): void => {
      for (const node of nodes) {
        lines.push(`${"  ".repeat(depth)}- \`${node.entry.id}\` ${node.entry.role ?? node.entry.kind}`);
        render(node.children, depth + 1);
      }
    };
    render(tree, 0);
    return { kind: "local", output: lines.join("\n") };
  }

  const events = transcriptFor(sessionId);
  const result = readSessionEntries(events, leafIdFor(sessionId, context.cwd), first);
  if (result === "unknown-cursor") return { kind: "local", output: unknownCursor(first!) };
  if (result.entries.length === 0) {
    return {
      kind: "local",
      output: first === undefined ? emptySession(sessionId) : "No entries after that cursor.",
    };
  }

  const lines = [
    "### Entries",
    "",
    `Leaf: \`${result.leafId ?? "none"}\``,
    "",
    "| Entry | Type | When |",
    "| :--- | :--- | :--- |",
    ...result.entries.map(
      (entry) => `| \`${entry.id}\` | ${entry.type} | ${entry.timestamp} |`,
    ),
    "",
    "Pass the last id to read only what follows it.",
  ];
  return { kind: "local", output: lines.join("\n") };
}

function emptySession(sessionId: string): string {
  return [
    "### Entries",
    "",
    `Session \`${sessionId}\` has recorded nothing yet, so there are no entries.`,
  ].join("\n");
}

function unknownCursor(cursor: string): string {
  return [
    "### Entries",
    "",
    `No entry with id \`${cursor}\` in this session.`,
    "",
    // Said plainly because the alternative reading — "nothing new" — is the one a
    // synchronising client would act on, and it would be wrong.
    "That cursor is not from this session. Listing from it would silently skip everything in between, so nothing is listed.",
  ].join("\n");
}
