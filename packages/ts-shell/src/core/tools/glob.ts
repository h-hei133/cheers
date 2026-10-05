/**
 * The glob tool: which files in the workspace match a pattern.
 *
 * Its own module rather than a block inside the registry, matching grep and the
 * language-server tool, because it now carries a result cap and a truncation
 * notice and that is more than a registry entry should hold.
 */

import { approvedResult } from './toolResultLifecycle.js'
import { matchesGlob } from './globMatch.js'
import { truncateHead } from './truncation.js'
import { ArtifactManager } from '../session/artifactManager.js'
import type { ToolDefinition } from '../../tools/types.js'
import type { ExecutionAuthority, ExecutionService } from '../../runtime/execution/service.js'

const TOOL_APPROVED_READ_AUTHORITY: ExecutionAuthority = {
  mode: 'read-only',
  source: 'tool-runtime-approval',
  reason: 'ToolRuntime approved the filesystem read before ExecutionService was called.',
}

/** Matches returned when the caller does not ask for a count. */
const DEFAULT_MATCH_LIMIT = 500

/**
 * The most matches one call may return.
 *
 * A workspace-wide pattern over this repository matches thousands of paths, and
 * the whole list used to be joined into one string and handed to the model. The
 * cap is what keeps a broad pattern from displacing the conversation that asked
 * for it.
 */
const MAX_MATCH_LIMIT = 1000

export function createGlobToolDefinition(
  executionService: ExecutionService,
): ToolDefinition {
  return {
    name: 'glob',
    description:
      'List files in the workspace matching a path pattern or suffix (e.g. **/*.ts, package.json).',
    argsSchema: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'The file pattern or suffix to match (e.g. *.json, src/**/*.ts).',
        },
        limit: {
          type: 'number',
          description: `Maximum number of paths to return (default: ${DEFAULT_MATCH_LIMIT}, max: ${MAX_MATCH_LIMIT}).`,
        },
      },
      required: ['pattern'],
    },
    async execute(args, context) {
      // Only trimmed. Stripping a leading `./` looks helpful but is not: the
      // character class that did it also ate the leading dot of a hidden file, so
      // `.gitignore` became `gitignore` and `.github/**` became `github/**`,
      // silently searching for a name the caller did not ask for. The matcher
      // understands `./` on its own, so there is nothing to strip.
      const pattern = (typeof args.pattern === 'string' ? args.pattern.trim() : '') || '*'
      const files = await executionService.listFilesRecursive({
        operationKind: 'file.list',
        absoluteRoot: context.workspaceRoot,
        workspaceRoot: context.workspaceRoot,
        authority: TOOL_APPROVED_READ_AUTHORITY,
        caller: 'core-tool:glob',
        reason: 'List approved workspace files for glob matching.',
        reportSafeTarget: context.workspaceRoot,
      })
      const filtered = files.filter((file) => matchesGlob(file, pattern))
      if (filtered.length === 0) {
        return approvedResult('No files matched the pattern.')
      }

      const requested = typeof args.limit === 'number' && args.limit > 0
        ? Math.floor(args.limit)
        : DEFAULT_MATCH_LIMIT
      const limit = Math.min(requested, MAX_MATCH_LIMIT)
      const page = filtered.slice(0, limit)

      // The count cap does not bound the response on its own: what arrives is
      // paths, and their length is not ours to choose. A thousand entries in a
      // monorepo with hashed directories is hundreds of kilobytes and tens of
      // thousands of tokens, which is why a byte budget is applied to the joined
      // result as well. The count cap still earns its place — it is what stops
      // the walk from formatting entries that will certainly be discarded.
      const raw = page.join('\n')
      const truncated = truncateHead(raw, { maxLines: Number.MAX_SAFE_INTEGER })
      const notices: string[] = []

      if (truncated.truncated) {
        // Spilled rather than dropped, so nothing matched is unreachable — the
        // model can read the rest instead of re-running a narrower search.
        const artifactManager = ArtifactManager.getShared(context.workspaceRoot, context.sessionId)
        const artifact = await artifactManager.save(raw, 'glob')
        notices.push(
          `${Math.round(truncated.shownBytes / 1024)}KB limit reached, showing ${truncated.shownLines} of ${filtered.length} matches. Full list written to ${artifact.uri}`,
        )
      }
      if (truncated.truncated) {
        // The byte budget is what stopped this answer, so suggesting a larger
        // `limit` would be advice that cannot work: the next page would be cut by
        // the same budget, and two notices naming different "showing N" counts
        // would contradict each other.
        notices.push(`Raising limit will not help: the byte budget is what stopped this. Narrow the pattern instead`)
      } else if (filtered.length > limit) {
        // The total is named as well as the page, because scale is what tells the
        // model whether to narrow the pattern or ask for more of it.
        notices.push(
          `Showing ${page.length} of ${filtered.length} matches (limit ${limit}). Use limit=${Math.min(limit * 2, MAX_MATCH_LIMIT)} for more, or narrow the pattern`,
        )
      }

      return approvedResult(
        notices.length === 0 ? truncated.content : `${truncated.content}\n\n[${notices.join('. ')}]`,
      )
    },
  }
}
