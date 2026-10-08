/**
 * How a directory listing is presented to the model.
 *
 * Reading a directory and reading a file answer the same question — "what is at
 * this path" — so they share one tool and one pagination scheme. The listing is
 * rendered here rather than in the tool body because the tool body is a long
 * chain of branches, and the rendering is the part worth reading on its own.
 *
 * The listing is one level. Recursing is what the glob tool answers; a listing
 * that descended would be a second, worse glob.
 */

import path from 'node:path'
import { listDirectoryEntries } from '../../runtime/execution/service.js'
import { truncateHead } from './truncation.js'
import { ArtifactManager } from '../session/artifactManager.js'

/**
 * Entries per page when the caller does not ask for a count.
 *
 * A directory with more direct children than this is rare, and the ones that have
 * them are usually the ones whose full listing is not useful — a build output
 * directory, a fixture folder. Paging keeps the response bounded either way.
 */
const DEFAULT_ENTRY_LIMIT = 500

/**
 * The most entries one page may hold, whatever the caller asks for.
 *
 * Bounded because the limit arrives from the model: without a ceiling a request
 * for a million entries would be honoured, and the response would displace the
 * conversation that asked for it.
 */
const MAX_ENTRY_LIMIT = 1000

/** The line the model reads when the page is full but the directory is not. */
function continuationNotice(
  displayPath: string,
  shown: number,
  total: number,
  nextOffset: number,
): string {
  return `\n[Showing entries ${nextOffset - shown}-${nextOffset - 1} of ${total}. Use read(path="${displayPath}", offset=${nextOffset}) to continue]`
}

export interface DirectoryListingRequest {
  readonly assertFileAccess?: (absolutePath: string) => void
  readonly abortSignal?: AbortSignal
  readonly absolutePath: string
  readonly workspaceRoot: string
  readonly artifactRoot?: string
  readonly sessionId?: string
  /** The path as the caller wrote it, used in the continuation hint. */
  readonly displayPath: string
  readonly offset?: number
  readonly limit?: number
}

/**
 * Render the direct contents of a directory for the model.
 *
 * An empty directory is reported as empty rather than as an error: it is a fact
 * about the workspace, and a model told "no such file" would go looking for a
 * different path when the path it chose was correct.
 */
export async function formatDirectoryListing(
  request: DirectoryListingRequest,
): Promise<{ output: string; outputNotice?: string }> {
  const listing = await listDirectoryEntries(
    request.workspaceRoot,
    request.absolutePath,
    { assertFileAccess: request.assertFileAccess, abortSignal: request.abortSignal },
  )
  request.abortSignal?.throwIfAborted()
  const entries = listing.entries
  const shownPath = displayDirectoryPath(request)

  if (entries.length === 0) {
    // An empty directory and a fully excluded one are different facts, and a
    // model that is told "empty" when entries exist will conclude the workspace
    // does not hold what it is looking for.
    if (listing.omittedCount > 0) {
      return { output: `Directory ${shownPath} holds no entries that this tool may show (${listing.omittedCount} omitted by ignore or access rules).` }
    }
    return { output: `Directory ${shownPath} is empty.` }
  }

  const offset =
    request.offset !== undefined && request.offset > 0
      ? Math.floor(request.offset)
      : 1
  const limit =
    request.limit !== undefined && request.limit > 0
      ? Math.min(Math.floor(request.limit), MAX_ENTRY_LIMIT)
      : DEFAULT_ENTRY_LIMIT
  const startIndex = Math.max(0, offset - 1)
  const endIndex = Math.min(entries.length, startIndex + limit)
  const page = entries.slice(startIndex, endIndex)

  const lines = page.map((entry) => `${entry.name}${entry.isDirectory ? '/' : ''}`)
  const header = `Directory ${shownPath} (${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}):`
  // Entry names are as long as the filesystem says, and the entry cap bounds
  // their number rather than their size — a directory of long names clears the
  // cap and still arrives over budget. The byte budget is what actually bounds
  // the response.
  const truncated = truncateHead(lines.join('\n'), { maxLines: Number.MAX_SAFE_INTEGER })
  const notices: string[] = []

  if (truncated.truncated) {
    // Only the selected page is saved; later entries remain outside it.
    const artifact = await ArtifactManager.getShared(request.artifactRoot ?? request.workspaceRoot, request.sessionId).save(
      lines.join('\n'),
      'read',
    )
    notices.push(`[${Math.round(truncated.shownBytes / 1024)}KB limit reached, showing ${truncated.shownLines} of ${lines.length} page entries. ${page.length}-entry page saved to ${artifact.uri}${endIndex < entries.length ? `; ${entries.length - endIndex} additional entries are outside this page` : ''}]`)
  } else if (endIndex < entries.length) {
    notices.push(continuationNotice(shownPath, page.length, entries.length, endIndex + 1).trimStart())
  }
  if (listing.omittedCount > 0) {
    notices.push(`[${listing.omittedCount} ${listing.omittedCount === 1 ? 'entry' : 'entries'} omitted by ignore or access rules]`)
  }
  request.abortSignal?.throwIfAborted()
  const outputNotice = notices.join('\n')
  return { output: [`${header}\n${truncated.content}`, outputNotice].filter(Boolean).join('\n'),
    outputNotice: [outputNotice, `[To inspect omitted page entries, re-read this directory using offset=${offset} and a smaller limit before advancing.]`].filter(Boolean).join('\n') }
}

/**
 * The directory as the model should see it named.
 *
 * The trailing separator is what distinguishes a listing of `src` from the
 * contents of the file `src`, and it is the form every continuation hint has to
 * carry for the next call to resolve to the same place.
 */
function displayDirectoryPath(request: DirectoryListingRequest): string {
  const relative = path.relative(request.workspaceRoot, request.absolutePath)
  const base =
    relative === '' ? '.' : relative.split(path.sep).join('/')
  return base.endsWith('/') ? base : `${base}/`
}
