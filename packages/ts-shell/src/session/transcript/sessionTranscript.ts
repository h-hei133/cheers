import * as fs from "node:fs";
import * as path from "node:path";
import {
  createMessageTranscriptEvent,
  createTranscriptEntryId,
  createTranscriptHeader,
  encodeTranscriptEvent,
  transcriptEventToSessionMessage,
  type TranscriptEvent,
} from "../sessionEventCodec.js";
import type { SessionMessage } from "../schema/sessionMessage.js";
import type { Session } from "../schema/sessionRecord.js";
import { publishedCompactionEvents } from '../compaction/publication.js';

export {
  parseTranscript,
  parseTranscriptAsync,
  readTranscript,
  readTranscriptEvents,
  readTranscriptSnapshot,
  readTranscriptSnapshotAsync,
  type ReadTranscript,
  type TranscriptReadLimits,
  type TranscriptSnapshot,
} from './read.js';

const CONTROL_CHECK_INTERVAL = 256;

/**
 * The messages on the branch the thread is looking at.
 *
 * The transcript holds every branch, because it is append-only and nothing that
 * was said is erased when the user steps away from it. Which of those lines the
 * conversation is currently made of is a question about the thread, so the thread
 * answers it: the active path names the messages in view.
 *
 * New compaction receipts require their captured path to remain a prefix of the
 * branch in view. Older receipts keep their historical global interpretation.
 *
 * Falling back to the whole transcript when no thread has been written keeps a
 * session recorded before any of this existed loading exactly as it did.
 */
export function projectBranchMessages(
  events: readonly TranscriptEvent[],
  activeEntryIds: readonly string[] | undefined,
  knownEntryIds?: readonly string[],
  signal?: AbortSignal,
): SessionMessage[] {
  signal?.throwIfAborted();
  let checks = 0;
  const check = (): void => { if ((checks++ & (CONTROL_CHECK_INTERVAL - 1)) === 0) signal?.throwIfAborted(); };
  if (activeEntryIds === undefined) return projectTranscriptMessages(
    publishedCompactionEvents(events, signal).filter(event => {
      check();
      return event.type !== 'compaction' || event.sourceActivePath === undefined;
    }),
    signal,
  );
  const onBranch = new Set(activeEntryIds);
  const known = knownEntryIds === undefined ? onBranch : new Set(knownEntryIds);

  const messages = events.filter((event) => {
    check();
    return event.type === "message";
  });
  // A thread that names none of these messages does not describe them — it was
  // written against some other transcript, or against a version of this one that
  // recorded no ids. Filtering by it would return an empty conversation, which
  // reads as "this session said nothing" rather than "these two files disagree",
  // so the transcript wins.
  if (messages.length > 0 && !messages.some((event) => event.id !== undefined && known.has(event.id))) {
    return projectTranscriptMessages(
      publishedCompactionEvents(events, signal).filter(event => {
        check();
        return event.type !== 'compaction' || event.sourceActivePath === undefined;
      }),
      signal,
    );
  }

  // A branch summary records what was left behind, so it stops applying once the
  // branch it describes is the one in view: reading it there would tell the user
  // what they had stepped away from while they were looking at it. The turns it
  // names are the test — a note whose abandoned turns are on the active path
  // describes the conversation in front of the reader, not one they left.
  return projectTranscriptMessages(
    publishedCompactionEvents(events, signal).filter((event) => {
      check();
      if (event.type === "message") {
        return event.id !== undefined && onBranch.has(event.id);
      }
      if (event.type === "branch_summary") {
        // A note written before the abandoned turns were recorded names none of
        // them, so there is nothing to test it with and it stays.
        const names = event.abandonedEntryIds ?? [];
        return names.length === 0 || !names.some((id) => onBranch.has(id));
      }
      if (event.type === 'compaction' && event.sourceActivePath) {
        return event.sourceActivePath.every((id, index) => activeEntryIds[index] === id);
      }
      return true;
    }),
    signal,
  );
}

/**
 * Add one entry to a transcript.
 *
 * This is the only place that appends, so it is the only place that has to be
 * sure the file starts the way a transcript should. The session writer does put a
 * header in when it creates the file, but a transcript on disk from an older
 * build has none, and nothing stops a caller from appending to a path directly.
 *
 * A header is written only when the file is absent or empty. A file with content
 * and no header is an older transcript, and it stays one: putting a header in
 * front of lines already written is exactly the rewrite these files are promised
 * never to get. Readers infer version 0 from the missing header instead.
 */
export function appendTranscriptEvent(
  transcriptPath: string,
  event: TranscriptEvent,
  header?: { readonly sessionId: string; readonly timestamp: string; readonly cwd: string },
  options?: { readonly requireExisting?: boolean },
): void {
  if (options?.requireExisting) {
    appendExistingEvent(transcriptPath, event);
    return;
  }
  ensureTranscriptHeader(transcriptPath, header);
  fs.appendFileSync(transcriptPath, `${encodeTranscriptEvent(event)}\n`, "utf8");
}

/** Preserve an interrupted tail and verify the appended record through the same file handle. */
function appendExistingEvent(transcriptPath: string, event: TranscriptEvent): void {
  const fd = fs.openSync(transcriptPath, fs.constants.O_RDWR | fs.constants.O_APPEND);
  try {
    const before = fs.fstatSync(fd); const last = Buffer.alloc(1);
    if (before.size) fs.readSync(fd, last, 0, 1, before.size - 1);
    const record = Buffer.from(`${encodeTranscriptEvent(event)}\n`, 'utf8');
    const separator = before.size && last[0] !== 10 ? Buffer.from('\n') : Buffer.alloc(0);
    fs.appendFileSync(fd, separator.length ? Buffer.concat([separator, record]) : record);
    const end = fs.fstatSync(fd).size; const actual = Buffer.alloc(record.length);
    let offset = 0;
    while (offset < actual.length) {
      const read = fs.readSync(fd, actual, offset, actual.length - offset, end - actual.length + offset);
      if (!read) throw new Error('Transcript append could not be verified.');
      offset += read;
    }
    const current = fs.statSync(transcriptPath);
    if (!actual.equals(record) || current.ino !== before.ino || current.dev !== before.dev) {
      throw new Error('Transcript append could not be verified.');
    }
  } finally { fs.closeSync(fd); }
}

/**
 * Give a new transcript its header, and leave every other file alone.
 *
 * Emptiness is the whole test, and it is asked of the file's size rather than its
 * contents. Reading the file to see whether it is empty would cost the whole
 * transcript on every append, which is the size of the session squared over its
 * life — on the hot path of every turn, for a question whose answer is a
 * stat call.
 *
 * A file with content and no header is an older transcript, and it stays one:
 * putting a header in front of lines already written is exactly the rewrite these
 * files are promised never to get.
 */
function ensureTranscriptHeader(
  transcriptPath: string,
  header: { readonly sessionId: string; readonly timestamp: string; readonly cwd: string } | undefined,
): void {
  let empty: boolean;
  try {
    empty = fs.statSync(transcriptPath).size === 0;
  } catch {
    // Absent, or unreadable. Only the absent case is ours to start.
    try {
      fs.statSync(transcriptPath);
      return;
    } catch {
      empty = true;
    }
  }
  if (!empty) return;
  const written = header ?? {
    sessionId: path.basename(path.dirname(transcriptPath)),
    timestamp: new Date().toISOString(),
    cwd: process.cwd(),
  };
  fs.writeFileSync(transcriptPath, `${JSON.stringify(createTranscriptHeader(written))}\n`, "utf8");
}

export function projectTranscriptMessages(
  events: readonly TranscriptEvent[],
  signal?: AbortSignal,
): SessionMessage[] {
  const messages: SessionMessage[] = [];
  const checkpoints: SessionMessage[] = [];
  let firstMessage = 0;

  let index = 0;
  for (const event of publishedCompactionEvents(events, signal)) {
    if ((index++ & (CONTROL_CHECK_INTERVAL - 1)) === 0) signal?.throwIfAborted();
    if (event.type === "compaction") {
      // Re-anchor context at the compaction checkpoint, keeping the most
      // recent messages verbatim behind it.
      // Checkpoints form a reversed prefix; ordinary messages form a forward
      // tail. Adjust its window instead of copying a long kept tail per receipt.
      const length = checkpoints.length + messages.length - firstMessage;
      const offset = event.keptMessages && event.keptMessages > 0 ? Math.trunc(-event.keptMessages) : undefined;
      const kept = offset === undefined ? 0 : offset < 0 ? Math.min(-offset, length) : length;
      const tailLength = messages.length - firstMessage;
      if (kept < tailLength) {
        firstMessage = messages.length - kept;
        checkpoints.length = 0;
        // Reclaim an obsolete prefix only when at least half the buffer was
        // dropped, so retained messages move at most once per discarded batch.
        if (firstMessage >= messages.length / 2) {
          messages.copyWithin(0, firstMessage);
          messages.length = kept;
          firstMessage = 0;
        }
      } else checkpoints.length = Math.min(checkpoints.length, kept - tailLength);
      checkpoints.push({
        role: "user",
        content: `[Context Checkpoint]\n${event.summary}`,
        metadata: { contextSummary: "compaction" },
        timestamp: event.timestamp,
      });
    } else if (event.type === "branch_summary") {
      // What the abandoned turns established, carried forward as a note. It is
      // not a turn the user took, so it reads as context rather than as speech.
      // A move with nothing to summarize adds no message: there is no content to
      // carry, and inventing a placeholder would put a turn in the conversation
      // that nobody said.
      if (event.summary !== undefined) {
        messages.push({
          role: "user",
          content: `[Earlier Path]\n${event.summary}`,
          metadata: { contextSummary: "branch" },
          timestamp: event.timestamp,
        });
      }
    } else if (event.type === "message") {
      const msg = transcriptEventToSessionMessage(event);
      if (msg) {
        messages.push(msg);
      }
    }
  }

  return checkpoints.reverse().concat(messages.slice(firstMessage));
}

export function appendCompactionEvent(
  transcriptPath: string,
  input: {
    readonly summary: string;
    readonly firstKeptEntryId?: string;
    readonly keptMessages?: number;
    readonly tokensBefore?: number;
    readonly timestamp: string;
  },
): void {
  appendTranscriptEvent(transcriptPath, {
    type: "compaction",
    id: createTranscriptEntryId("comp"),
    summary: input.summary,
    firstKeptEntryId: input.firstKeptEntryId,
    keptMessages: input.keptMessages,
    tokensBefore: input.tokensBefore,
    timestamp: input.timestamp,
  });
}

export function appendBranchSummaryEvent(
  transcriptPath: string,
  input: {
    /** Absent when nothing could summarize the abandoned turns. */
    readonly summary?: string;
    readonly droppedTurns: number;
    /** The entry the conversation moved to. */
    readonly toEntryId?: string;
    /** The turns left behind, so the note can be read back only where it applies. */
    readonly abandonedEntryIds?: readonly string[];
    readonly timestamp: string;
  },
): void {
  appendTranscriptEvent(transcriptPath, {
    type: "branch_summary",
    id: createTranscriptEntryId("brsum"),
    ...(input.summary !== undefined ? { summary: input.summary } : {}),
    droppedTurns: input.droppedTurns,
    ...(input.toEntryId !== undefined ? { toEntryId: input.toEntryId } : {}),
    ...(input.abandonedEntryIds !== undefined && input.abandonedEntryIds.length > 0
      ? { abandonedEntryIds: input.abandonedEntryIds }
      : {}),
    timestamp: input.timestamp,
  });
}

export function appendSessionTurn(input: {
  readonly session: Session;
  readonly message: SessionMessage;
  readonly timestamp: string;
  readonly append: (event: TranscriptEvent) => void;
  readonly writeMetadata: (session: Session) => void;
  readonly writeState: (session: Session) => void;
}): void {
  const nextMessage: SessionMessage & { timestamp: string } = {
    ...input.message,
    timestamp: input.timestamp,
    // Named at the moment it is recorded, so the thread can point back at it.
    // The transcript and the turn list then agree on which message is which,
    // which is what lets a branch be resolved into the messages it contains.
    id: input.message.id ?? createTranscriptEntryId("turn"),
  };
  input.session.turns.push(nextMessage);
  input.session.updatedAt = input.timestamp;
  input.append(createMessageTranscriptEvent(nextMessage));
  input.writeMetadata(input.session);
  input.writeState(input.session);
}
