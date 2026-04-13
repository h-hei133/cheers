import type { StreamingRenderer } from '../../renderer/StreamingRenderer.js'
import type { QueryRuntimeStateSeed } from '../query/runtimeState.js'
import type { ContinuationReason, TerminalReason } from '../../orchestration/types.js'
import type { SessionManager } from '../../session/SessionManager.js'
import type { OrchestrationStatus } from '../../orchestration/types.js'
import { ShellStateMachine } from './stateMachine.js'
import type { QueryEvent } from '../query/events.js'

export interface SessionRuntimeDependencies {
  readonly sessionManager: SessionManager
  readonly renderer: StreamingRenderer
  readonly runPrompt: (prompt: string, signal: AbortSignal, runtimeSeed?: QueryRuntimeStateSeed) => AsyncIterable<QueryEvent>
}

export class ShellSessionRuntime {
  private readonly deps: SessionRuntimeDependencies
  private readonly stateMachine = new ShellStateMachine()
  private currentRunController: AbortController | null = null

  constructor(deps: SessionRuntimeDependencies) {
    this.deps = deps
  }

  getState() {
    return this.stateMachine.getState()
  }

  getCurrentRunController(): AbortController | null {
    return this.currentRunController
  }

  async executePrompt(
    sessionId: string,
    prompt: string,
    options?: { runtimeSeed?: QueryRuntimeStateSeed },
  ): Promise<string> {
    this.currentRunController = new AbortController()
    const signal = this.currentRunController.signal
    this.stateMachine.startRun()
    let finalOutput = ''
    let terminalStatus: OrchestrationStatus = 'completed'
    let terminalStopReason: string | undefined
    let terminalReason: TerminalReason = 'completed'
    let terminalClassification: 'success' | 'stopped' | 'error' = 'success'
    let lastContinuationReason: ContinuationReason | undefined
    let startedRendering = false
    let enteredQueryPhase = false

    try {
      if (!options?.runtimeSeed) {
        this.deps.sessionManager.persistUserPromptBarrier(sessionId, prompt)
      }

      let sawTerminalEvent = false

      if (options?.runtimeSeed && options.runtimeSeed.recoveryBoundary !== 'fresh-entry') {
        this.deps.sessionManager.markRecoveryReentry(sessionId, options.runtimeSeed.recoveryBoundary)
        enteredQueryPhase = options.runtimeSeed.recoveryBoundary === 'mid-turn-reentry'
      }

      for await (const event of this.deps.runPrompt(prompt, signal, options?.runtimeSeed)) {
        if (!enteredQueryPhase) {
          enteredQueryPhase = true
          this.deps.sessionManager.markTurnActive(sessionId)
        }
        this.deps.sessionManager.appendQueryEvent(sessionId, event)
        switch (event.type) {
          case 'mcp.snapshot':
            this.deps.renderer.renderLine(`\n[MCP] clients=${event.clients} tools=${event.tools}`)
            break
          case 'tool.started':
            this.deps.renderer.renderLine(`\n[tool:start] ${event.toolName}`)
            break
          case 'approval.requested':
            this.deps.renderer.renderLine(`\n[approval] requested for ${event.toolName}`)
            break
          case 'approval.resolved':
            this.deps.renderer.renderLine(`\n[approval] ${event.toolName} ${event.outcome}`)
            break
          case 'tool.result':
            this.deps.renderer.renderLine(`\n[tool:result] ${event.toolName} success=${event.success}`)
            break
          case 'query.retrying':
            this.deps.renderer.renderLine(`\n[query:retry] role=${event.role} turn=${event.turn} attempt=${event.attempt} reason=${event.reason}`)
            break
          case 'message.delta':
            if (!startedRendering) {
              this.deps.renderer.renderLine('\n🤖 Assistant:')
              startedRendering = true
            }
            this.deps.renderer.renderChunk(event.delta)
            break
          case 'lifecycle.cancelled':
            this.deps.renderer.renderLine(`\n[cancelled] ${event.reason}`)
            break
          case 'lifecycle.error':
            this.deps.renderer.renderLine(`\n[error] ${event.error}`)
            break
          case 'query.completed':
            sawTerminalEvent = true
            finalOutput = event.result.finalOutput
            terminalStatus = event.result.status
            terminalStopReason = event.result.stopReason
            terminalReason = event.result.terminalReason
            terminalClassification = event.result.terminalClassification
            lastContinuationReason = event.result.lastContinuationReason
            break
          case 'query.failed':
            sawTerminalEvent = true
            throw new Error(event.error)
          default:
            break
        }
      }

      if (startedRendering && terminalStatus === 'completed') {
        this.deps.renderer.renderLine('\n')
        this.deps.renderer.renderLine('✅ Response complete\n')
      }

      if (finalOutput.length > 0) {
        this.deps.sessionManager.addTurn(sessionId, { role: 'assistant', content: finalOutput })
      }

      if (!sawTerminalEvent) {
        throw new Error('Query runtime ended without a terminal event')
      }

      if (terminalStatus === 'completed') {
        this.deps.sessionManager.saveCompleted(sessionId, {
          terminalReason,
          terminalClassification,
          lastContinuationReason,
        })
      } else {
        this.deps.sessionManager.saveError(sessionId, terminalStopReason ?? terminalStatus, {
          terminalReason,
          terminalClassification,
          lastContinuationReason,
        })
      }
      this.stateMachine.completeRun()
      this.currentRunController = null
      return finalOutput
    } catch (error) {
      if (signal.aborted) {
        this.deps.sessionManager.appendQueryEvent(sessionId, {
          type: 'lifecycle.cancelled',
          reason: 'AbortSignal triggered during shell session runtime',
        })
        this.deps.sessionManager.saveInterrupted(sessionId, enteredQueryPhase ? 'turn' : 'prompt')
        this.stateMachine.interruptRun()
      } else {
        this.deps.sessionManager.appendQueryEvent(sessionId, {
          type: 'lifecycle.error',
          error: error instanceof Error ? error.message : String(error),
        })
        this.deps.sessionManager.saveError(
          sessionId,
          error instanceof Error ? error.message : String(error),
          {
            terminalReason: 'stopped_error',
            terminalClassification: 'error',
            lastContinuationReason,
          },
        )
        this.stateMachine.failRun()
      }
      this.currentRunController = null
      throw error
    }
  }

  cancelCurrentRun(): void {
    this.currentRunController?.abort()
    this.stateMachine.interruptRun()
  }

  terminate(sessionId: string): void {
    this.stateMachine.terminate()
    this.deps.sessionManager.saveTerminated(sessionId)
  }
}
