import * as fs from "node:fs";
import {
  classifyTranscriptLine,
  legacyTranscriptEntryId,
  transcriptVersionOf,
  TRANSCRIPT_FORMAT_VERSION,
  type TranscriptEvent,
  type TranscriptHeader,
} from "../sessionEventCodec.js";
import { fileIdentity, readTextFile, readTextFileAsync } from '../../core/workspace/files.js';

export interface TranscriptReadLimits {
  readonly maxBytes: number;
  readonly maxLines: number;
}

/**
 * The whole transcript: its format version, and the entries in order.
 *
 * The header is not returned as an entry. It describes the file rather than being
 * part of the conversation, and every caller here wants the conversation.
 */
export interface ReadTranscript {
  /** The format the file was written in; 0 when it has no header. */
  readonly version: number;
  readonly events: readonly TranscriptEvent[];
  readonly unreadableLines: number;
  readonly warnings: readonly string[];
}

export interface TranscriptSnapshot extends ReadTranscript {
  readonly truncated: boolean;
}

const TRANSCRIPT_READ_CHUNK_BYTES = 64 * 1024;
const CONTROL_CHECK_INTERVAL = 256;
const YIELD_INTERVAL = 1024;

export function readTranscriptEvents(transcriptPath: string, limits?: TranscriptReadLimits, signal?: AbortSignal): TranscriptEvent[] {
  return readTranscriptSnapshot(transcriptPath, limits, false, signal).events as TranscriptEvent[];
}

/**
 * Read a transcript, header included in what is reported.
 *
 * Header lines are not numbered. The derived name an entry gets when it has no id
 * comes from its position, so counting a header would shift every such name by
 * one in a file that has one — the same entry would answer to a different name
 * depending on whether a header happened to precede it. Entries start at one
 * either way.
 */
export function readTranscript(transcriptPath: string, limits?: TranscriptReadLimits, signal?: AbortSignal): ReadTranscript {
  const { truncated: _truncated, ...result } = readTranscriptSnapshot(transcriptPath, limits, false, signal);
  return result;
}

export function readTranscriptSnapshot(
  transcriptPath: string,
  limits?: TranscriptReadLimits,
  salvage = false,
  signal?: AbortSignal,
): TranscriptSnapshot {
  signal?.throwIfAborted();
  if (!fs.existsSync(transcriptPath)) {
    return { version: 0, events: [], unreadableLines: 0, warnings: [], truncated: false };
  }
  const acquired = salvage && limits
    ? readTranscriptPrefix(transcriptPath, limits, signal)
    : {
      text: limits ? readTextFile(transcriptPath, limits.maxBytes) : fs.readFileSync(transcriptPath, "utf8"),
      truncated: false,
    };
  if (acquired.text === undefined) throw new Error('The saved transcript is unavailable.');
  signal?.throwIfAborted();
  const result = parseTranscript(acquired.text, limits?.maxLines, signal);
  signal?.throwIfAborted();
  return finaliseTranscriptSnapshot(result, acquired.truncated, limits, salvage, signal);
}

/** Chunked counterpart used by cancellable navigation; it yields between each descriptor read. */
export async function readTranscriptSnapshotAsync(
  transcriptPath: string,
  limits?: TranscriptReadLimits,
  salvage = false,
  signal?: AbortSignal,
): Promise<TranscriptSnapshot> {
  await yieldForAbort(signal);
  if (!fs.existsSync(transcriptPath)) {
    return { version: 0, events: [], unreadableLines: 0, warnings: [], truncated: false };
  }
  const acquired = !salvage && limits
    ? { text: await readTextFileAsync(transcriptPath, limits.maxBytes, signal), truncated: false }
    : await readTranscriptPrefixAsync(transcriptPath, limits, signal);
  if (acquired.text === undefined) throw new Error('The saved transcript is unavailable.');
  await yieldForAbort(signal);
  const result = await parseTranscriptAsync(acquired.text, limits?.maxLines, signal);
  await yieldForAbort(signal);
  return finaliseTranscriptSnapshot(result, acquired.truncated, limits, salvage, signal);
}

function finaliseTranscriptSnapshot(
  result: ReadTranscript,
  truncated: boolean,
  limits: TranscriptReadLimits | undefined,
  salvage: boolean,
  signal?: AbortSignal,
): TranscriptSnapshot {
  const warnings = [...result.warnings];
  if (truncated) warnings.push('The saved transcript exceeds the navigation limit; only its readable prefix is shown.');
  if (limits && !salvage && warnings.length > 0) throw new Error('The saved transcript is damaged or has uncertain provenance.');
  if (limits) {
    const identities = new Set<string>();
    for (let index = 0; index < result.events.length; index++) {
      if ((index & 255) === 0) signal?.throwIfAborted();
      const event = result.events[index]!;
      if (event.id !== undefined && identities.has(event.id)) throw new Error('The saved transcript has duplicate entry identities.');
      if (event.id !== undefined) identities.add(event.id);
    }
  }
  return { ...result, warnings, truncated };
}

function readTranscriptPrefix(
  transcriptPath: string,
  limits: TranscriptReadLimits,
  signal?: AbortSignal,
): { text: string; truncated: boolean } {
  const before = fs.lstatSync(transcriptPath);
  if (!before.isFile()) throw new Error('The saved transcript is unavailable.');
  const fd = fs.openSync(transcriptPath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fs.fstatSync(fd);
    if (fileIdentity(opened) !== fileIdentity(before)) throw new Error('The saved transcript changed while it was being read.');
    const sourceSize = opened.size;
    const length = Math.min(opened.size, limits.maxBytes);
    const bytes = Buffer.alloc(length);
    let offset = 0;
    while (offset < bytes.length) {
      signal?.throwIfAborted();
      const read = fs.readSync(fd, bytes, offset, Math.min(TRANSCRIPT_READ_CHUNK_BYTES, bytes.length - offset), offset);
      if (!read) throw new Error('The saved transcript changed while it was being read.');
      offset += read;
    }
    const after = fs.fstatSync(fd);
    if (fileIdentity(after) !== fileIdentity(opened) || after.size !== opened.size) {
      throw new Error('The saved transcript changed while it was being read.');
    }
    return decodeTranscriptPrefix(bytes, sourceSize, limits, signal);
  } finally {
    fs.closeSync(fd);
  }
}

async function readTranscriptPrefixAsync(
  transcriptPath: string,
  limits: TranscriptReadLimits | undefined,
  signal?: AbortSignal,
): Promise<{ text: string; truncated: boolean }> {
  const before = await fs.promises.lstat(transcriptPath);
  if (!before.isFile()) throw new Error('The saved transcript is unavailable.');
  const handle = await fs.promises.open(transcriptPath,
    fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0));
  let bytes: Buffer;
  let sourceSize: number;
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || fileIdentity(opened) !== fileIdentity(before)) {
      throw new Error('The saved transcript changed while it was being read.');
    }
    const length = limits ? Math.min(opened.size, limits.maxBytes) : opened.size;
    sourceSize = opened.size;
    bytes = Buffer.alloc(length);
    let offset = 0;
    while (offset < bytes.length) {
      await yieldForAbort(signal);
      const { bytesRead } = await handle.read(bytes, offset, Math.min(TRANSCRIPT_READ_CHUNK_BYTES, bytes.length - offset), offset);
      if (!bytesRead) throw new Error('The saved transcript changed while it was being read.');
      offset += bytesRead;
    }
    const after = await handle.stat();
    if (fileIdentity(after) !== fileIdentity(opened) || after.size !== opened.size
      || after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs) {
      throw new Error('The saved transcript changed while it was being read.');
    }
  } finally {
    await handle.close();
  }
  return limits
    ? decodeTranscriptPrefix(bytes, sourceSize!, limits, signal)
    : { text: bytes.toString('utf8'), truncated: false };
}

function decodeTranscriptPrefix(
  bytes: Buffer,
  sourceSize: number,
  limits: TranscriptReadLimits,
  signal?: AbortSignal,
): { text: string; truncated: boolean } {
  signal?.throwIfAborted();
  let truncated = sourceSize > limits.maxBytes;
  let text = bytes.toString('utf8');
  signal?.throwIfAborted();
  if (truncated) {
    const end = text.lastIndexOf('\n');
    text = end < 0 ? '' : text.slice(0, end + 1);
  }
  let lines = text.length === 0 ? 0 : 1;
  for (let index = 0; index < text.length; index++) {
    if ((index & (TRANSCRIPT_READ_CHUNK_BYTES - 1)) === 0) signal?.throwIfAborted();
    if (text.charCodeAt(index) !== 10 || index + 1 >= text.length) continue;
    lines += 1;
    if (lines > limits.maxLines) {
      text = text.slice(0, index + 1);
      truncated = true;
      break;
    }
  }
  return { text, truncated };
}

function* transcriptLines(text: string): Iterable<string> {
  let start = 0;
  while (start < text.length) {
    const end = text.indexOf('\n', start);
    if (end < 0) {
      yield text.slice(start);
      return;
    }
    yield text.slice(start, end);
    start = end + 1;
  }
}

async function yieldForAbort(signal?: AbortSignal): Promise<void> {
  await new Promise<void>(resolve => setImmediate(resolve));
  signal?.throwIfAborted();
}

/** Decode already acquired text through the same compatibility rules as replay. */
export function parseTranscript(text: string, maxLines?: number, signal?: AbortSignal): ReadTranscript {
  signal?.throwIfAborted();
  const parser = createTranscriptParser();
  let lines = 0;
  for (const line of transcriptLines(text)) {
    if ((lines & (CONTROL_CHECK_INTERVAL - 1)) === 0) signal?.throwIfAborted();
    lines += 1;
    if (maxLines !== undefined && lines > maxLines) {
      throw new Error('The saved transcript exceeds the navigation line limit.');
    }
    parser.accept(line);
  }
  signal?.throwIfAborted();
  return parser.finish();
}

/** Same decoder and line semantics, with an event-loop yield between bounded batches. */
export async function parseTranscriptAsync(
  text: string,
  maxLines?: number,
  signal?: AbortSignal,
): Promise<ReadTranscript> {
  await yieldForAbort(signal);
  const parser = createTranscriptParser();
  let lines = 0;
  for (const line of transcriptLines(text)) {
    if ((lines & (CONTROL_CHECK_INTERVAL - 1)) === 0) signal?.throwIfAborted();
    if ((lines & (YIELD_INTERVAL - 1)) === 0) await yieldForAbort(signal);
    lines += 1;
    if (maxLines !== undefined && lines > maxLines) {
      throw new Error('The saved transcript exceeds the navigation line limit.');
    }
    parser.accept(line);
  }
  await yieldForAbort(signal);
  return parser.finish();
}

function createTranscriptParser(): { accept(line: string): void; finish(): ReadTranscript } {
  const events: TranscriptEvent[] = [];
  let header: TranscriptHeader | undefined;
  let lineNumber = 0;
  let unreadableLines = 0;
  const warnings = new Set<string>();
  return {
    accept(line) {
      if (!line) return;
      const decoded = classifyTranscriptLine(line);
      if (decoded.kind === "header") {
        if (header || lineNumber > 0) warnings.add("An unexpected transcript header was found; file provenance is uncertain.");
        if (!Number.isInteger(decoded.header.version) || decoded.header.version < 0 || decoded.header.version > TRANSCRIPT_FORMAT_VERSION) {
          warnings.add("The transcript format version is unsupported; only recognized entries are shown.");
        }
        // Only the first one counts. A second can only come from a concatenated
        // file, and letting it overwrite the real header would report the wrong
        // version for the entries that follow it.
        header ??= decoded.header;
        return;
      }
      lineNumber += 1;
      if (decoded.kind === "entry") {
        events.push(
          decoded.event.id === undefined
            ? { ...decoded.event, id: legacyTranscriptEntryId(lineNumber) }
            : decoded.event,
        );
      } else {
        unreadableLines += 1;
      }
    },
    finish() {
      if (unreadableLines > 0) warnings.add(`${unreadableLines} unreadable transcript ${unreadableLines === 1 ? "line was" : "lines were"} omitted.`);
      return { version: transcriptVersionOf(header), events, unreadableLines, warnings: [...warnings] };
    },
  };
}
