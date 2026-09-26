import { stat } from 'node:fs/promises'

/**
 * What a read handed the model, so a second identical read can say so instead.
 *
 * Reading the same unchanged file again spends the model's context to tell it
 * what it was already told. The reply is a sentence pointing at the earlier
 * result, which costs a line rather than the file.
 *
 * What is remembered is the *request*, not the answer: the offset and limit the
 * model asked for, alongside the file's modification time. Resolving them to
 * line numbers first would need the file, which is the read being avoided.
 */
interface SeenRead {
  /** The offset the model asked for; 1 when it asked for none. */
  readonly offset: number;
  /** The limit the model asked for; 0 meaning "whatever the default is". */
  readonly limit: number;
  /** The file's modification time when the read happened, in milliseconds. */
  readonly modifiedMs: number;
  /**
   * Whether the model was shown everything it asked for.
   *
   * False when the output was cut short or spilled, in which case the earlier
   * result is not a substitute for reading again: pointing the model at a part
   * would let it take the part for the file.
   */
  readonly complete: boolean;
}

const seenBySession = new Map<string, Map<string, SeenRead>>()

function sessionCache(sessionId: string): Map<string, SeenRead> {
  const existing = seenBySession.get(sessionId)
  if (existing) return existing
  const created = new Map<string, SeenRead>()
  seenBySession.set(sessionId, created)
  return created
}

/**
 * Whether this exact read was already answered from this exact file content.
 *
 * Every condition has to hold. The modification time is the one that actually
 * decides, because it is the only evidence the bytes are unchanged; the offset
 * and limit decide whether it is even the same question, since a different range
 * is different work.
 *
 * A file that cannot be stat-ed is treated as changed. Skipping the read on the
 * strength of a failed lookup would hide a missing file from the model, and
 * being told the file is gone is more useful than a pointer to what it held.
 *
 * The modification time has one-millisecond resolution, so a write landing in
 * the same millisecond as the read would go unnoticed. That is why edits and
 * writes made through this shell forget the entry outright rather than relying
 * on the clock: the tools that change files are the case that would hit it, and
 * they do not depend on the timestamp at all.
 */
export async function alreadySeen(
  sessionId: string,
  absolutePath: string,
  request: { readonly offset: number; readonly limit: number },
): Promise<boolean> {
  const seen = sessionCache(sessionId).get(absolutePath)
  if (!seen || !seen.complete) return false
  if (seen.offset !== request.offset || seen.limit !== request.limit) return false
  try {
    return (await stat(absolutePath)).mtimeMs === seen.modifiedMs
  } catch {
    return false
  }
}

/** Remember what a read was asked for, so an identical one can be answered with a pointer. */
export function rememberRead(
  sessionId: string,
  absolutePath: string,
  seen: SeenRead,
): void {
  sessionCache(sessionId).set(absolutePath, seen)
}

/**
 * Forget a file, because something other than a read changed it.
 *
 * Called after an edit or a write. The next read then goes to disk, which is
 * what makes the edit visible: without this, a read after an edit would be
 * answered with a pointer to the content from before it.
 */
export function forgetRead(sessionId: string, absolutePath: string): void {
  sessionCache(sessionId).delete(absolutePath)
}

/**
 * Forget everything for a session.
 *
 * Used when the conversation is condensed or cleared: the earlier result the
 * pointer refers to is no longer in the model's context, so pointing at it would
 * refer to something the model cannot see.
 */
export function forgetSessionReads(sessionId: string): void {
  seenBySession.delete(sessionId)
}
