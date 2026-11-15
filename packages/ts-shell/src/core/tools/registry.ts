import path from 'node:path'
import { verifyPathContainment } from '../security/pathJail.js'
import { resolveWorkspaceRoot } from '../workspace/roots.js'
import { createTaskOutputToolDefinition, createTaskStopToolDefinition, createTaskWaitToolDefinition } from './shell/background.js';
import { withFileLock } from '../../runtime/execution/fileLock.js'
import { createUnifiedDiff } from '../../presentation/tui/transcript/diff.js'
import {
  createDefaultExecutionService,
  type ExecutionAuthority,
  type ExecutionService,
} from '../../runtime/execution/service.js'
import { McpGatewayBlockedError, type CoreMcpGateway } from '../mcp/gateway.js'
import { classifyMcpFailure, classifyUnknownMcpFailure, mcpFailureMetadata } from '../mcp/errorTaxonomy.js'
import { createGlobToolDefinition } from './glob.js'
import { createReadToolDefinition } from './read.js'
import { createSkillToolDefinition, type SkillCatalog } from './skill.js'
import { createTeamToolDefinition } from './teamTool.js'
import { createGrepToolDefinition } from './grep.js'
import { createWebFetchToolDefinition } from './webFetch.js'
import { createWebSearchToolDefinition } from './webSearch.js'
import { createLspToolDefinition } from './lsp.js'
import { createUnifiedBrowserToolDefinition } from './browserToolUnified.js'
import { createDesktopToolDefinition } from '../../desktop/tool.js'
import { createAskToolDefinition } from './ask.js'
import { createTodoToolDefinition } from './todoTool.js'
import { createTaskToolDefinition } from './taskTool.js'
import type { PwRuntimeStatus } from '../../browser/playwrightRuntime.js'
import type { McpToolDescriptor } from '../mcp/types.js'
import type { ToolDefinition, ToolExecutionContext } from '../../tools/types.js'
import { resolveToolTarget } from './permissionContext.js'
import { validateToolArguments } from './arguments.js'
import { approvedResult, deniedResult, runtimeErrorResult } from './toolResultLifecycle.js'
import { createPatchToolDefinition } from '../../edit/patch/tool.js'
import { createEditToolDefinition } from '../../edit/tool.js'
import { createCodemodeToolDefinition } from './codemode/tool.js'
import { createShellToolDefinition } from './shell/tool.js'

const TOOL_APPROVED_READ_AUTHORITY: ExecutionAuthority = {
  mode: 'read-only',
  source: 'tool-runtime-approval',
  reason: 'ToolRuntime approved the filesystem read before ExecutionService was called.',
}
const TOOL_APPROVED_WRITE_AUTHORITY: ExecutionAuthority = {
  mode: 'approved-for-write',
  source: 'tool-runtime-approval',
  reason: 'ToolRuntime approved the filesystem write before ExecutionService was called.',
}


/**
 * Why a write was refused, and how to allow it.
 *
 * The refusal is a jail, not a permission question: nothing the model can say
 * changes it, and a bare "outside workspace" reads as an arbitrary restriction
 * rather than a boundary with a way through. The way through is a command the
 * user runs, so the message names it — the model can then ask for it instead of
 * retrying a call that cannot succeed.
 */
function outsideWorkspaceMessage(reason: string | undefined, target: string, workspaceRoot: string): string {
  const why = reason ?? `Target '${target}' is outside the workspace.`
  return `${why} Writes are limited to the workspace (${workspaceRoot}) and the roots the user attaches. `
    + `To allow this path, the user can run /workspace add <path> --write, then retry.`
}

export function createCoreToolRegistry(options?: {
  mcpTools?: readonly McpToolDescriptor[]
  mcpGateway?: Pick<CoreMcpGateway, 'invokeTool'>
  browserRuntimeStatus?: PwRuntimeStatus
  executionService?: ExecutionService
  /**
   * Skills the skill tool may load.
   *
   * Absent means no skill tool is registered at all: a tool that could only ever
   * answer "no such skill" is worse than no tool, because the model would keep
   * trying it.
   */
  skills?: SkillCatalog
}): ReadonlyMap<string, ToolDefinition> {
  const executionService = options?.executionService ?? createDefaultExecutionService()
  const tools: ToolDefinition[] = [
    createReadToolDefinition(executionService),
    createPatchToolDefinition(),
    {
      name: 'write',
      description: 'Create or overwrite a file in the workspace with content.',
      argsSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The relative path of the file to write.',
          },
          content: {
            type: 'string',
            description: 'The full file content to write.',
          },
        },
        required: ['path', 'content'],
      },
      async execute(args, context) {
        // The read decides the write, so both sit under one lock: taking it
        // only for the write would let two edits read the same original.
        validateToolArguments(this.argsSchema, args)
        return withFileLock(resolveToolTarget(args, 'path', context.workspaceRoot), async () => {
          const target = resolveToolTarget(args, 'path', context.workspaceRoot)
          // No attached roots means the primary root is the only authority, and the
          // lexical fence below already describes that refusal without touching
          // the filesystem.
          const root = context.workspaceRoots?.length
            ? resolveWorkspaceRoot(context.workspaceRoot, context.workspaceRoots, target, 'write') ?? context.workspaceRoot
            : context.workspaceRoot
          const containment = verifyPathContainment(target, root)
          if (!containment.allowed) {
            throw new Error(outsideWorkspaceMessage(containment.reason, target, root))
          }
          const content = args.content as string
          const relPath = path.relative(root, containment.resolvedPath)
          let original = ''
          let originalUnreadable = false
          try {
            original = await executionService.readTextFile({
              operationKind: 'file.read',
              assertFileAccess: context.assertFileAccess,
              abortSignal: context.abortSignal,
              absolutePath: containment.resolvedPath,
              workspaceRoot: root,
              authority: TOOL_APPROVED_READ_AUTHORITY,
              caller: 'core-tool:write',
              reason: 'Read original content for diff.',
              reportSafeTarget: containment.resolvedPath,
            })
          } catch (error) {
            if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
            originalUnreadable = true
          }
          const written = await executionService.writeTextFile({
            operationKind: 'file.write',
            ...(context.sessionId ? { editIdentity: { sessionId: context.sessionId, workspaceRoot: context.artifactRoot ?? context.workspaceRoot, callId: context.taskId, correlationId: context.correlationId } } : {}),
            assertFileAccess: context.assertFileAccess,
            abortSignal: context.abortSignal,
            absolutePath: target,
            content,
            workspaceRoot: root,
            authority: TOOL_APPROVED_WRITE_AUTHORITY,
            caller: 'core-tool:write',
            reason: 'Write an approved workspace file target.',
            reportSafeTarget: containment.resolvedPath,
          })
          const diff = original && original !== content ? createUnifiedDiff(relPath, original, content) : ''
          const output = diff
            ? `Updated ${relPath}\n\n\`\`\`diff\n${diff}\n\`\`\``
            : originalUnreadable
              ? `Wrote ${relPath} (original unreadable, no diff)`
              : `Wrote ${relPath}`
          return approvedResult(output, written ? { ...written } : { status: 'unverified' })
          })
      },
    },
    createEditToolDefinition(executionService),
    createGlobToolDefinition(executionService),
    createGrepToolDefinition(executionService),
    createShellToolDefinition(executionService),
    createTeamToolDefinition(),
    createTaskOutputToolDefinition(),
    createTaskWaitToolDefinition(),
    createTaskStopToolDefinition(),
    createWebFetchToolDefinition(),
    createWebSearchToolDefinition(),
    createLspToolDefinition(executionService),
    createAskToolDefinition(),
    createTodoToolDefinition(),
    createTaskToolDefinition(),
    createUnifiedBrowserToolDefinition(),
    createDesktopToolDefinition(executionService),
  ]

  if (options?.skills && options.skills.size > 0) {
    tools.push(createSkillToolDefinition(options.skills))
  }

  for (const tool of options?.mcpTools ?? []) {
    tools.push({
      name: tool.qualifiedName,
      description: `[MCP:${tool.serverName}] ${tool.description}`,
      argsSchema: tool.inputSchema ?? { type: 'object' },
      mcpAnnotations: { readOnlyHint: tool.annotations?.readOnlyHint === true },
      async execute(args, context) {
        if (!options?.mcpGateway) {
          // A tool without its gateway is a registration mistake, and the
          // mistake is best said here rather than answered with a fake
          // success the model cannot recover from.
          return deniedResult(
            `The MCP gateway is not connected, so ${tool.qualifiedName} cannot be called. Report this to the user.`,
          )
        }
        try {
          const answer = await options.mcpGateway.invokeTool(
            tool.serverName,
            tool.toolName,
            args,
            undefined,
            { signal: context.abortSignal, contractId: tool.contractId },
          )
          if (answer.isError) {
            // The server answered, and what it said is a failure in its own
            // words. Handed back as success the model would believe the call
            // worked; as a failure it can react, or tell the user what the
            // server said.
            return deniedResult(
              `${tool.qualifiedName} failed on server "${tool.serverName}": ${answer.content}`,
            )
          }
          return approvedResult(answer.content)
        } catch (error) {
          const failure = error instanceof McpGatewayBlockedError
            ? classifyMcpFailure({ failureClass: error.mcpFailureClass, detail: error.mcpSafeDetail })
            : classifyUnknownMcpFailure(error)
          return runtimeErrorResult(
            `[MCP ${failure.failureClass}; ${failure.failurePlane}] ${failure.safeDetail}`,
            mcpFailureMetadata(failure),
          )
        }
      },
    })
  }
  let toolMap = new Map<string, ToolDefinition>()
  tools.push(createCodemodeToolDefinition(() => toolMap))
  toolMap = new Map(tools.map(tool => [tool.name, tool]))
  return toolMap
}
