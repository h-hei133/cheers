import fs from "node:fs";
import { createSessionStoreLayout, locateExistingSessionLayout } from "../store/sessionFileLayout.js";
import { loadSessionRecord } from "../store/sessionStore.js";
import { readSessionThreadSnapshot } from "../store/threadState.js";
import { readSessionTree, type SessionTreeNodeView } from "../query/sessionEntries.js";
import { readTranscriptEvents } from "../transcript/sessionTranscript.js";
import type { SessionThreadEntry } from "../schema/sessionThread.js";
import type { TranscriptEvent } from "../sessionEventCodec.js";
import { redactExportText } from "../../core/security/redaction.js";
import { renderMarkdownHtml } from "./htmlRender.js";

/**
 * A session gathered into the shape an exported page reads.
 *
 * The conversation and its tree live in different files. The transcript is an
 * append-only log of what was said and has no parent pointers; the tree is in
 * the session state and has no message content. Neither alone is enough to draw
 * a page with a sidebar you can navigate, so this reads both and joins them by
 * entry id — which is the one field they share.
 *
 * Everything a string here passes through the export scrubber. An export is a
 * file someone sends to another person, so a credential that appeared in a
 * command or a tool's output must not travel with it.
 */

/** One message as the page renders it. */
export interface ExportEntry {
  readonly id: string;
  readonly role: string;
  readonly content: string;
  /**
   * The content as HTML, rendered where the markdown scan already ran.
   *
   * Computed here rather than in the page because the page would need its own
   * markdown scanner, and a second scanner is a second opinion about the same
   * text. The page still receives `content` for filtering and for the sidebar.
   */
  readonly html: string;
  readonly toolCalls?: readonly { readonly id: string; readonly name: string; readonly arguments: string }[];
  readonly toolCallId?: string;
  readonly origin?: { readonly provider?: string; readonly model: string };
  readonly timestamp?: string;
}

/** One row of the sidebar tree. */
export interface ExportTreeNode {
  readonly id: string;
  readonly parentId?: string;
  readonly role?: string;
  readonly kind: string;
  /** A short line of the entry's own text, so the sidebar reads without the body. */
  readonly preview: string;
  readonly timestamp?: string;
  readonly children: readonly ExportTreeNode[];
}

export interface ExportPayload {
  readonly header: {
    readonly sessionId: string;
    readonly exportedAt: string;
    readonly workspace: string;
  };
  readonly tree: readonly ExportTreeNode[];
  readonly entries: readonly ExportEntry[];
  readonly leafId: string | null;
  /**
   * Tool results by the call they answer.
   *
   * A result is its own message with a `toolCallId`, and the page shows it
   * inside the call it belongs to. Keyed rather than left in the list so the
   * page does not have to scan every entry to find one.
   */
  readonly results: Readonly<Record<string, string>>;
}

export type ExportGatherResult =
  | { readonly ok: true; readonly payload: ExportPayload }
  | { readonly ok: false; readonly reason: string };

/**
 * Read `sessionId` into an export payload.
 *
 * A session whose state cannot be read still exports: the transcript is the
 * conversation, and losing the sidebar is a smaller loss than refusing to write
 * the file. That case yields a single-branch tree built from the messages, so
 * the page renders with a flat sidebar rather than no sidebar.
 */
export function gatherExport(input: {
  readonly sessionId: string;
  readonly workspace: string;
  readonly now?: () => Date;
}): ExportGatherResult {
  let layout: ReturnType<typeof locateExistingSessionLayout>;
  try {
    layout = locateExistingSessionLayout(createSessionStoreLayout(), input.sessionId);
  } catch {
    return { ok: false, reason: `Session \`${input.sessionId}\` was not found.` };
  }
  // The layout is projected whether or not the directory exists, so asking for a
  // session that was never written would otherwise read as "no conversation" —
  // which sends the reader looking for a missing message rather than a missing
  // session.
  if (!fs.existsSync(layout.sessionDir)) {
    return { ok: false, reason: `Session \`${input.sessionId}\` was not found.` };
  }

  const events = readTranscriptEvents(layout.transcriptPath);
  const messages = events.filter((event): event is Extract<TranscriptEvent, { type: "message" }> =>
    event.type === "message",
  );
  if (messages.length === 0) {
    return { ok: false, reason: `Session \`${input.sessionId}\` has no conversation recorded yet.` };
  }

  const entries = messages.map(toExportEntry);
  const results: Record<string, string> = {};
  for (const entry of entries) {
    if (entry.role === "tool" && entry.toolCallId !== undefined) results[entry.toolCallId] = entry.content;
  }
  const tree = readTree(input.sessionId, layout, input.workspace, entries);

  return {
    ok: true,
    payload: {
      header: {
        sessionId: input.sessionId,
        exportedAt: (input.now ?? (() => new Date()))().toISOString(),
        workspace: input.workspace,
      },
      tree: tree.nodes,
      entries,
      leafId: tree.leafId,
      results,
    },
  };
}

/**
 * The sidebar tree, joined to the messages by entry id.
 *
 * Falls back to a flat tree when the session state is unreadable, because the
 * conversation is still worth exporting without a navigable sidebar.
 */
function readTree(
  sessionId: string,
  layout: ReturnType<typeof locateExistingSessionLayout>,
  workspace: string,
  entries: readonly ExportEntry[],
): { readonly nodes: readonly ExportTreeNode[]; readonly leafId: string | null } {
  try {
    const session = loadSessionRecord({ sessionId, layout, cwd: workspace });
    const snapshot = readSessionThreadSnapshot({ session, layout });
    const tree = readSessionTree(snapshot.entries);
    if (tree !== "unknown-cursor" && tree.length > 0) {
      const byId = new Map(entries.map((entry) => [entry.id, entry]));
      return {
        nodes: tree.map((node) => toExportNode(node, byId)),
        leafId: snapshot.activeLeafId ?? null,
      };
    }
  } catch {
    // Falls through to the flat tree below.
  }
  return { nodes: flatTree(entries), leafId: entries.at(-1)?.id ?? null };
}

function toExportNode(
  node: SessionTreeNodeView,
  byId: ReadonlyMap<string, ExportEntry>,
): ExportTreeNode {
  const entry: SessionThreadEntry = node.entry;
  return {
    id: entry.id,
    ...(entry.parentId !== undefined ? { parentId: entry.parentId } : {}),
    ...(entry.role !== undefined ? { role: entry.role } : {}),
    kind: entry.kind,
    preview: previewFor(byId.get(entry.id), entry.role),
    ...(entry.timestamp !== undefined ? { timestamp: entry.timestamp } : {}),
    children: node.children.map((child) => toExportNode(child, byId)),
  };
}

/** The messages as one flat branch, for a session whose state could not be read. */
function flatTree(entries: readonly ExportEntry[]): readonly ExportTreeNode[] {
  let parent: ExportTreeNode | undefined;
  const roots: ExportTreeNode[] = [];
  for (const entry of entries) {
    const node: ExportTreeNode = {
      id: entry.id,
      ...(parent ? { parentId: parent.id } : {}),
      role: entry.role,
      kind: "turn-message",
      preview: previewFor(entry, entry.role),
      ...(entry.timestamp !== undefined ? { timestamp: entry.timestamp } : {}),
      children: [],
    };
    if (parent) (parent.children as ExportTreeNode[]).push(node);
    else roots.push(node);
    parent = node;
  }
  return roots;
}

/**
 * A line of the entry's own text for the sidebar.
 *
 * Computed here rather than in the page because the page would have to parse
 * every message body to build its own sidebar, and the sidebar only ever shows
 * the first line of it.
 */
function previewFor(entry: ExportEntry | undefined, role: string | undefined): string {
  const label = role ?? "entry";
  if (!entry) return label;
  const firstLine = entry.content.split("\n").find((line) => line.trim() !== "") ?? "";
  const trimmed = firstLine.trim().slice(0, 80);
  return trimmed === "" ? label : `${label}: ${trimmed}`;
}

function toExportEntry(event: Extract<TranscriptEvent, { type: "message" }>): ExportEntry {
  const toolCalls = event.tool_calls?.map((call) => ({
    id: call.id,
    name: call.function.name,
    // Arguments are a string of JSON the model wrote, and they routinely carry a
    // command line. Scrubbed rather than parsed: parsing would drop whatever
    // does not fit a shape, and the page shows them as text.
    arguments: redactExportText(call.function.arguments),
  }));
  const content = redactExportText(event.content);
  return {
    id: event.id ?? "",
    role: event.role,
    content,
    html: renderMarkdownHtml(content),
    ...(toolCalls && toolCalls.length > 0 ? { toolCalls } : {}),
    ...(event.tool_call_id !== undefined ? { toolCallId: event.tool_call_id } : {}),
    ...(event.origin !== undefined ? { origin: event.origin } : {}),
    timestamp: event.timestamp,
  };
}
