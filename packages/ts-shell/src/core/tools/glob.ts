/**
 * The glob tool: which files in the workspace match a pattern.
 *
 * Its own module rather than a block inside the registry, matching grep and the
 * language-server tool, because it now carries a result cap and a truncation
 * notice and that is more than a registry entry should hold.
 */

import { approvedResult } from './toolResultLifecycle.js'
import { matchesGlob } from './globMatch.js'
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
    permissions: { check: () => [] },
    async execute(args, context) {
      const rawPattern = typeof args.pattern === 'string' ? args.pattern.trim() : ''
      const pattern = rawPattern.replace(/^[./\\]+/, '') || '*'
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

      if (filtered.length <= limit) {
        return approvedResult(page.join('\n'))
      }
      // The count and the ceiling are both named, because the model has to be
      // able to tell "these are all of them" from "these are the first of many"
      // to decide whether to narrow the pattern or page through.
      return approvedResult(
        `${page.join('\n')}\n\n[Showing ${page.length} of ${filtered.length} matches (limit ${limit}). ` +
          `Narrow the pattern, or pass limit=${Math.min(filtered.length, MAX_MATCH_LIMIT)} to see more]`,
      )
    },
  }
}
