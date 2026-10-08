import fs from 'node:fs/promises'
import { verifyPathContainment } from '../security/pathJail.js'
import { formatNonVisionFallback, getImageMimeType, isImageFilePath } from '../../model-adapters/multimodal.js'
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
    description: 'Read UTF-8 text in the workspace, with bounded line offset/limit pagination. Text scans read at most 8MiB and check a 5-second deadline between reads; text content is capped at 50KiB. Reading a directory path lists its direct contents instead, one level deep. Image files are identified without returning image content.',
    argsSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The relative path of the file or directory to read (e.g. package.json, src/index.ts, src).',
        },
        offset: {
          type: 'number',
          description: 'The 1-based starting line number, or entry number when reading a directory (default: 1).',
        },
        limit: {
          type: 'number',
          description: 'The maximum number of lines, or entries when reading a directory (default: 500, max: 1000).',
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
          return approvedResult(
            await formatDirectoryListing({
              assertFileAccess: context.assertFileAccess,
              abortSignal: context.abortSignal,
              absolutePath: containment.resolvedPath,
              workspaceRoot: context.workspaceRoot,
              artifactRoot: context.artifactRoot,
              displayPath: selector.cleanPath,
              sessionId: context.sessionId,
              offset: typeof args.offset === 'number' ? args.offset : undefined,
              limit: typeof args.limit === 'number' ? args.limit : undefined,
            }),
          )
        }
        // An image read as text is mojibake, and mojibake is worse than a
        // refusal: it looks like content. Say what the file is and how to view
        // it instead of handing the model bytes it cannot interpret.
        if (isImageFilePath(containment.resolvedPath)) {
          const stats = await fs.stat(containment.resolvedPath)
          return approvedResult(
            formatNonVisionFallback({
              type: 'image',
              data: '',
              mimeType: getImageMimeType(containment.resolvedPath),
            }) +
              `\n${selector.cleanPath} is ${Math.round(stats.size / 1024)}KB on disk. ` +
              `Its bytes cannot be read as text; this model receives no image content. ` +
              `Use bash to inspect it (e.g. file, identify, exiftool) if you need facts about it.`,
          )
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

      const offset = selector.hasSelector ? selector.startLine ?? 1
        : typeof args.offset === 'number' && args.offset > 0 ? Math.floor(args.offset) : 1
      const limit = selector.hasSelector
        ? selector.endLine === undefined ? selector.isRaw ? 1000 : 500 : Math.min(1000, selector.endLine - offset + 1)
        : typeof args.limit === 'number' && args.limit > 0 ? Math.min(1000, Math.floor(args.limit)) : 500
      const page = await executionService.readTextPage({ ...request, offset, limit })
      const { text: _, ...metadata } = page
      return approvedResult(formatPage(page), { read: metadata })
    },
  }
}

function formatPage(page: TextPageReadResult): string {
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
  return notes.length ? [page.text, ...notes.map(note => `[${note}]`)].filter(Boolean).join('\n') : page.text
}
