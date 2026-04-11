import type { SchemaVersion } from '../../../../contracts/typescript/types.js'
import type { QueryRuntimeStateSeed } from '../core/query/runtimeState.js'
import { OpenAIModelAdapter } from '../model-adapters/providers/openai/OpenAIModelAdapter.js'
import { createComponentLogger, recordCount } from '../observability/index.js'
import { getRuntimeConfig } from '../config/runtimeConfig.js'
import { MultiAgentOrchestrator } from './MultiAgentOrchestrator.js'
import type { AgentExecutionInput, AgentExecutionOutput, OrchestrationResult } from './types.js'
import { SandboxEnforcer, type EscalationDecision } from '../sandbox/index.js'
import { ToolDispatcher } from '../tools/dispatcher.js'
import { getWorkflowGitContext } from '../workflow/gitContext.js'
import { CoreMcpGateway } from '../core/mcp/gateway.js'
import type { QueryEvent } from '../core/query/events.js'

const CONTRACT_VERSION: SchemaVersion = '1.0.0'

export interface MvpIntegratedFlowOptions {
  readonly sessionId: string
  readonly prompt: string
  readonly workspaceRoot: string
  readonly maxTurns?: number
  readonly escalationDecision?: EscalationDecision
  readonly runtimeSeed?: QueryRuntimeStateSeed
}

export async function runMvpIntegratedFlow(
  options: MvpIntegratedFlowOptions,
): Promise<OrchestrationResult> {
  const logger = createComponentLogger('orchestration')
  const workflowContext = getWorkflowGitContext(options.workspaceRoot)
  const runtimeConfig = getRuntimeConfig(options.workspaceRoot)
  const mcpGateway = new CoreMcpGateway(options.workspaceRoot)
  const mcpSnapshot = await mcpGateway.snapshot()
  const enforcer = new SandboxEnforcer({
    workspaceRoot: options.workspaceRoot,
    sessionId: options.sessionId,
  })

  if (options.escalationDecision) {
    enforcer.setEscalationPromptHandler(async prompt => ({
      promptId: prompt.id,
      decision: options.escalationDecision,
      respondedAt: Date.now(),
      userComment: `Decision from runtime config: ${options.escalationDecision}`,
    }))
  }

  const dispatcher = new ToolDispatcher(enforcer, {
    mcpTools: mcpSnapshot.tools,
    mcpGateway,
    runtimeConfig,
  })
  const runner = createIntegratedRunner(
    options.prompt,
    options.workspaceRoot,
    dispatcher,
    workflowContext,
    mcpSnapshot,
  )

  try {
    const orchestrator = new MultiAgentOrchestrator(runner)
    logger.info('Integrated flow started', { sessionId: options.sessionId })
    const result = await orchestrator.run(options.sessionId, options.prompt, {
      maxTurns: options.maxTurns ?? 6,
      runtimeSeed: options.runtimeSeed,
    })
    logger.info('Integrated flow finished', {
      sessionId: options.sessionId,
      status: result.status,
    })
    recordCount('orchestration.runs', 1, { status: result.status })
    return result
  } finally {
    enforcer.close()
  }
}

export async function* streamMvpIntegratedFlow(
  options: MvpIntegratedFlowOptions,
): AsyncIterable<QueryEvent> {
  const workflowContext = getWorkflowGitContext(options.workspaceRoot)
  const runtimeConfig = getRuntimeConfig(options.workspaceRoot)
  const mcpGateway = new CoreMcpGateway(options.workspaceRoot)
  const mcpSnapshot = await mcpGateway.snapshot()
  const enforcer = new SandboxEnforcer({
    workspaceRoot: options.workspaceRoot,
    sessionId: options.sessionId,
  })
  enforcer.setEscalationPromptHandler(async prompt => ({
    promptId: prompt.id,
    decision: options.escalationDecision,
    respondedAt: Date.now(),
    userComment: `Synthetic ${options.escalationDecision} for integration flow`,
  }))

  const dispatcher = new ToolDispatcher(enforcer, {
    mcpTools: mcpSnapshot.tools,
    mcpGateway,
    runtimeConfig,
  })
  const runner = createIntegratedRunner(
    options.prompt,
    options.workspaceRoot,
    dispatcher,
    workflowContext,
    mcpSnapshot,
  )

  try {
    const orchestrator = new MultiAgentOrchestrator(runner)
    yield* orchestrator.stream(options.sessionId, options.prompt, {
      maxTurns: options.maxTurns ?? 6,
      runtimeSeed: options.runtimeSeed,
    })
  } finally {
    enforcer.close()
  }
}

function createIntegratedRunner(
  prompt: string,
  workspaceRoot: string,
  dispatcher: ToolDispatcher,
  workflowContext: ReturnType<typeof getWorkflowGitContext>,
  mcpSnapshot: Awaited<ReturnType<CoreMcpGateway['snapshot']>>,
): (input: AgentExecutionInput) => Promise<AgentExecutionOutput> {
  const wantsEscalation = /approval|forbidden|bash/i.test(prompt)
  const expectsForbiddenDeny = /forbidden|denied|deny/i.test(prompt)

  return async ({ role, sharedContext, turn }) => {
    if (role === 'planner') {
      const content = await streamRoleDraft(
        role,
        `Plan accepted for prompt: ${sharedContext.initialPrompt}. Proceed to coding and respect sandbox policy.`,
      )

      return {
        role,
        content,
        handoffTo: 'coder',
        handoffReason: 'Plan validated and ready',
        events: [
          {
            type: 'mcp.snapshot',
            clients: mcpSnapshot.clients.length,
            tools: mcpSnapshot.tools.length,
          },
        ],
        notes: [
          `planner: turn=${turn}`,
          `workflow: branch=${workflowContext.branch ?? 'unknown'} clean=${workflowContext.isClean === true ? 'yes' : 'no'}`,
          `mcp: clients=${mcpSnapshot.clients.length} tools=${mcpSnapshot.tools.length}`,
          `visible-tools: ${dispatcher.listVisibleTools().join(', ') || 'none'}`,
          ...(workflowContext.branch === 'main' && workflowContext.isClean === false
            ? ['workflow: recommend using an isolated worktree before heavy implementation on a dirty main branch']
            : []),
        ],
      }
    }

    if (role === 'coder') {
      const notes: string[] = []
      const events: QueryEvent[] = []
      const readTaskId = `task_${sharedContext.sessionId}_${turn}_read`

      events.push({ type: 'tool.started', toolName: 'read', taskId: readTaskId })
      const readResult = await dispatcher.dispatch(
        'read',
        { path: 'package.json' },
        {
          taskId: readTaskId,
          workspaceRoot,
          sessionId: sharedContext.sessionId,
        },
      )
      events.push({ type: 'tool.result', toolName: 'read', taskId: readTaskId, success: readResult.success })

      if (readResult.success) {
        notes.push('tool: approved read(package.json)')
      } else {
        notes.push(`tool: denied read(package.json) -> ${readResult.error ?? 'unknown'}`)
      }

      if (wantsEscalation) {
        const bashTaskId = `task_${sharedContext.sessionId}_${turn}_bash`
        events.push({ type: 'approval.requested', toolName: 'bash', taskId: bashTaskId })
        events.push({ type: 'tool.started', toolName: 'bash', taskId: bashTaskId })
        const bashResult = await dispatcher.dispatch(
          'bash',
          { command: 'node --version' },
          {
            taskId: bashTaskId,
            workspaceRoot,
            sessionId: sharedContext.sessionId,
          },
        )
        events.push({
          type: 'approval.resolved',
          toolName: 'bash',
          taskId: bashTaskId,
          outcome: bashResult.success ? 'approved' : 'denied',
        })
        events.push({ type: 'tool.result', toolName: 'bash', taskId: bashTaskId, success: bashResult.success })

        if (bashResult.success) {
          notes.push('tool: approved bash(node --version) via escalation')
        } else {
          notes.push(`tool: denied bash(node --version) -> ${bashResult.error ?? 'unknown'}`)
          if (expectsForbiddenDeny) {
            const fallbackResult = await dispatcher.dispatch(
              'glob',
              { pattern: '.ts' },
              {
                taskId: `task_${sharedContext.sessionId}_${turn}_fallback`,
                workspaceRoot,
                sessionId: sharedContext.sessionId,
              },
            )

            if (fallbackResult.success) {
              notes.push('tool: safe fallback glob(.ts) succeeded after denial')
            } else {
              notes.push(
                `tool: safe fallback glob(.ts) failed -> ${fallbackResult.error ?? 'unknown'}`,
              )
            }
          }
        }
      }

      const content = await streamRoleDraft(
        role,
        `Implementation pass complete with ${notes.length} tool decision(s).`,
      )

      return {
        role,
        content,
        handoffTo: 'reviewer',
        handoffReason: 'Coding pass and tool dispatch complete',
        events,
        notes,
      }
    }

    const content = await streamRoleDraft(
      role,
      'Review complete. Delivering streamed result and preserving safety guardrails.',
    )
    return {
      role,
      content,
      notes: [`reviewer: handoffs=${sharedContext.handoffs.length}`],
    }
  }
}

async function streamRoleDraft(role: 'planner' | 'coder' | 'reviewer', draft: string): Promise<string> {
  const adapter = new OpenAIModelAdapter(
    { provider: 'openai', apiKey: 'local-mvp-test-key' },
    async () =>
      new Response(createSyntheticSseBody(`${role.toUpperCase()}: ${draft}`), {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
  )

  let text = ''
  for await (const event of adapter.streamResponse({
    schemaVersion: CONTRACT_VERSION,
    model: 'gpt-4.1-mini',
    messages: [{ role: 'user', content: draft }],
  })) {
    if (event.type === 'content.delta') {
      text += event.delta
    }
  }

  return text.trim()
}

function createSyntheticSseBody(content: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const first = content.slice(0, Math.ceil(content.length / 2))
  const second = content.slice(Math.ceil(content.length / 2))

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            model: 'gpt-4.1-mini',
            choices: [{ delta: { content: first } }],
          })}\n\n`,
        ),
      )
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            model: 'gpt-4.1-mini',
            choices: [{ delta: { content: second }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 5, completion_tokens: 8, total_tokens: 13 },
          })}\n\n`,
        ),
      )
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  })
}
