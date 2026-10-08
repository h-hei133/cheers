import fs from 'node:fs/promises'
import { verifyPathContainment } from '../security/pathJail.js'
import { isImageFilePath } from '../../model-adapters/multimodal.js'
import { ArtifactManager } from '../session/artifactManager.js'
import { parsePathSelector } from './selectorParser.js'
import { formatDirectoryListing } from './directoryListing.js'
import { resolveToolTarget } from './permissionContext.js'
import { approvedResult } from './toolResultLifecycle.js'
import type { ToolDefinition } from '../../tools/types.js'
import type { ExecutionService, TextPageReadRequest, TextPageReadResult } from '../../runtime/execution/types.js'

const AUTHORITY = { mode: 'read-only', source: 'tool-runtime-approval', reason: 'Read an approved file page.' } as const

export function createReadToolDefinition(executionService: ExecutionService): ToolDefinition {
  return {
    name: 'read',
    description: 'Read bounded UTF-8 text pages, PDF text pages or direct directory entries. PDF offset/limit count pages (default/max five per read, max 200 document pages); PDF extraction is text-only, with no OCR. Images produce a decoded visual frame when the native reader and model vision support are available. Media requires Linux and native utilities, accepts at most 16MiB and has a shared 15-second deadline. Text scans at most 8MiB/5 seconds and returns at most 50KiB.',
    argsSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The relative path of the file or directory to read (e.g. package.json, src/index.ts, src).',
        },
        offset: {
          type: 'number',
          description: 'The 1-based starting line, directory entry or PDF page (default: 1). Images reject offset/limit.',
        },
        limit: {
          type: 'number',
          description: 'Maximum text lines or directory entries (default: 500, max: 1000); for PDF, pages (default/max: 5).',
        },
      },
      required: ['path'],
    },
    async execute(args, context) {
      const rawPath = typeof args.path === 'string' ? args.path : ''
      const selector = parsePathSelector(rawPath)
      const artifactManager = ArtifactManager.getShared(context.artifactRoot ?? context.workspaceRoot, context.sessionId)
      let target = selector.cleanPath
      const isArtifact = target.startsWith('artifact://')
      let request: TextPageReadRequest

      if (isArtifact) {
        const resolvedArtifact = artifactManager.resolve(target)
        if (!resolvedArtifact) {
          throw new Error(`Artifact '${target}' not found in session storage.`)
        }
        request = {
          operationKind: 'file.read',
          assertFileAccess: context.assertFileAccess,
          abortSignal: context.abortSignal,
          absolutePath: resolvedArtifact,
          artifactDirectory: artifactManager.directory,
          workspaceRoot: context.artifactRoot ?? context.workspaceRoot,
          authority: AUTHORITY,
          caller: 'core-tool:read:artifact',
          reason: 'Read session artifact output log.',
          reportSafeTarget: resolvedArtifact,
        }
      } else {
        target = resolveToolTarget({ path: selector.cleanPath }, 'path', context.workspaceRoot)
        const containment = verifyPathContainment(target, context.workspaceRoot)
        if (!containment.allowed) {
          throw new Error(containment.reason ?? `Target '${target}' is outside workspace jail.`)
        }
        // A directory is a legitimate thing to read. Handing the model a raw
        // EISDIR instead of the names it asked for makes "what is in here"
        // unanswerable without shelling out, so the listing is answered here,
        // through the same ignore policy every other tool walks with.
        const stats = await fs.stat(containment.resolvedPath).catch(() => undefined)
        if (stats?.isDirectory()) {
          const listing = await formatDirectoryListing({
            assertFileAccess: context.assertFileAccess,
            abortSignal: context.abortSignal,
            absolutePath: containment.resolvedPath,
            workspaceRoot: context.workspaceRoot,
            artifactRoot: context.artifactRoot,
            displayPath: selector.cleanPath,
            sessionId: context.sessionId,
            offset: typeof args.offset === 'number' ? args.offset : undefined,
            limit: typeof args.limit === 'number' ? args.limit : undefined,
          })
          return approvedResult(listing.output, listing.outputNotice ? { outputNotice: listing.outputNotice } : undefined)
        }
        // A read returns bytes from this invocation. Session identity and
        // file timestamps cannot prove earlier content is still visible to
        // this model, or that an external writer left the bytes unchanged.
        request = {
          operationKind: 'file.read',
          assertFileAccess: context.assertFileAccess,
          abortSignal: context.abortSignal,
          absolutePath: containment.resolvedPath,
          workspaceRoot: context.workspaceRoot,
          authority: AUTHORITY,
          caller: 'core-tool:read',
          reason: 'Read an approved workspace file target.',
          reportSafeTarget: containment.resolvedPath,
        }
      }

      if (isImageFilePath(request.absolutePath)) {
        if (selector.hasSelector || args.offset !== undefined || args.limit !== undefined) throw new Error('Image reads do not accept line offsets or limits.')
        const media = await executionService.readMedia({ ...request, kind: 'image' })
        context.abortSignal?.throwIfAborted()
        return { success: true, ...media }
      }
      if (request.absolutePath.toLowerCase().endsWith('.pdf')) {
        if (selector.hasSelector) throw new Error('PDF reads use offset/limit for pages; line selectors are not supported.')
        const media = await executionService.readMedia({ ...request, kind: 'pdf',
          offset: args.offset as number | undefined, limit: args.limit as number | undefined })
        context.abortSignal?.throwIfAborted()
        return { success: true, ...media }
      }

      const offset = selector.hasSelector ? selector.startLine ?? 1
        : typeof args.offset === 'number' && args.offset > 0 ? Math.floor(args.offset) : 1
      const limit = selector.hasSelector
        ? selector.endLine === undefined ? selector.isRaw ? 1000 : 500 : Math.min(1000, selector.endLine - offset + 1)
        : typeof args.limit === 'number' && args.limit > 0 ? Math.min(1000, Math.floor(args.limit)) : 500
      const page = await executionService.readTextPage({ ...request, offset, limit })
      context.abortSignal?.throwIfAborted()
      const { text: _, ...metadata } = page
      const formatted = formatPage(page)
      return approvedResult(formatted.output, { read: metadata, outputNotice: formatted.outputNotice })
    },
  }
}

function formatPage(page: TextPageReadResult): { output: string; outputNotice: string } {
  if (page.totalLines !== undefined && page.startLine > page.totalLines) {
    throw new Error(`Offset ${page.startLine} is beyond end of file (${page.totalLines} lines).`)
  }
  const notes: string[] = []
  if (page.oversizedLine !== undefined) {
    notes.push(`Line ${page.oversizedLine} exceeds the 50KB line limit. Use byte-range inspection for this line; increasing the line count will not help.`)
  }
  if (page.stopReason) {
    const reason = { 'line-limit': 'line limit', 'output-limit': 'output byte limit',
      'scan-limit': '8MB scan limit', deadline: 'read deadline' }[page.stopReason]
    if (page.endLine >= page.startLine) {
      notes.push(`Showing lines ${page.startLine}-${page.endLine} of an uncounted file (${reason}).${page.nextOffset ? ` Use offset=${page.nextOffset} to continue.` : ''}`)
    } else if (!page.oversizedLine) notes.push(`Read stopped at the ${reason} before a complete requested line could be returned.`)
    if (page.stopReason === 'scan-limit') {
      notes.push('Line offsets scan from the beginning of the file. Use byte-range inspection to read beyond this scan limit.')
    }
  } else if (page.startLine > 1) {
    notes.push(`Showing lines ${page.startLine}-${page.endLine} of ${page.totalLines}.`)
  }
  const notice = notes.map(note => `[${note}]`).join('\n')
  return {
    output: [page.text, notice].filter(Boolean).join('\n'),
    // This guidance is reserved for a model projection that drops page text;
    // nextOffset describes the complete tool page, not the shortened message.
    outputNotice: [notice, `[To inspect omitted page text, re-read the same file without a line selector using offset=${page.startLine} and a smaller limit before advancing. If a single line is still shortened, use byte-range inspection.]`].filter(Boolean).join('\n'),
  }
}
