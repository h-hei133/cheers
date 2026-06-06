import type {
  AgentRunner,
  OrchestrationResult,
  OrchestratorOptions,
} from '../../../orchestration/types.js'
import { getRolePrompt } from '../../../orchestration/prompts.js'
import { mapTerminalToOrchestrationResult } from '../mapping/mapper.js'
import type { QueryEvent } from './events.js'
import {
  createQueryRuntimeStateFromSeed,
  createQueryRuntimeState,
  type QueryRuntimeConfig,
  type QueryRuntimeStateSeed,
} from './state.js'
import type { QueryRuntimeExecutionBatchExecutor } from './batch.js'
import { runQueryLoop } from './loop.js'

const DEFAULT_MAX_TURNS = 12

export interface QueryEngineConfig {
  readonly runAgent: AgentRunner
  readonly executeRuntimeBatch?: QueryRuntimeExecutionBatchExecutor
  readonly getRolePrompt?: typeof getRolePrompt
}

type QueryEngineOptions = OrchestratorOptions & {
  readonly runtimeSeed?: QueryRuntimeStateSeed
}

export class QueryEngine {
  private readonly config: QueryEngineConfig

  constructor(config: QueryEngineConfig) {
    this.config = config
  }

  async submitMessage(
    sessionId: string,
    initialPrompt: string,
    options: QueryEngineOptions = {},
  ): Promise<OrchestrationResult> {
    const runtimeConfig: QueryRuntimeConfig = {
      sessionId,
      initialPrompt,
      maxTurns: options.maxTurns ?? DEFAULT_MAX_TURNS,
      startingRole: options.startingRole ?? 'planner',
    }

    const state = options.runtimeSeed
      ? createQueryRuntimeStateFromSeed(options.runtimeSeed)
      : createQueryRuntimeState(runtimeConfig)
    const terminal = await runQueryLoop(state, {
      runAgent: this.config.runAgent,
      executeRuntimeBatch: this.config.executeRuntimeBatch,
      getRolePrompt: this.config.getRolePrompt ?? getRolePrompt,
    })

    return mapTerminalToOrchestrationResult(state, terminal)
  }

  async *streamMessage(
    sessionId: string,
    initialPrompt: string,
    options: QueryEngineOptions = {},
  ): AsyncIterable<QueryEvent> {
    const runtimeConfig: QueryRuntimeConfig = {
      sessionId,
      initialPrompt,
      maxTurns: options.maxTurns ?? DEFAULT_MAX_TURNS,
      startingRole: options.startingRole ?? 'planner',
    }

    const state = options.runtimeSeed
      ? createQueryRuntimeStateFromSeed(options.runtimeSeed)
      : createQueryRuntimeState(runtimeConfig)
    if (!options.runtimeSeed || options.runtimeSeed.recoveryBoundary === 'fresh-entry') {
      yield { type: 'query.started', sessionId, prompt: initialPrompt }
    }

    const queuedEvents: QueryEvent[] = []
    let wakeStream: (() => void) | null = null
    let terminalResult: OrchestrationResult | null = null
    let streamError: unknown = null
    let streamFinished = false

    try {
      void runQueryLoop(state, {
        runAgent: this.config.runAgent,
        executeRuntimeBatch: this.config.executeRuntimeBatch,
        getRolePrompt: this.config.getRolePrompt ?? getRolePrompt,
        onEvent: event => {
          queuedEvents.push(event)
          wakeStream?.()
          wakeStream = null
        },
      }).then(terminal => {
        terminalResult = mapTerminalToOrchestrationResult(state, terminal)
        streamFinished = true
        wakeStream?.()
        wakeStream = null
      }).catch(error => {
        streamError = error
        streamFinished = true
        wakeStream?.()
        wakeStream = null
      })

      while (!streamFinished || queuedEvents.length > 0) {
        if (queuedEvents.length === 0) {
          await new Promise<void>(resolve => {
            wakeStream = resolve
          })
          continue
        }

        yield queuedEvents.shift() as QueryEvent
      }

      if (streamError) {
        yield {
          type: 'query.failed',
          error: streamError instanceof Error ? streamError.message : String(streamError),
        }
        throw streamError
      }

      if (terminalResult) {
        yield { type: 'query.completed', result: terminalResult }
      }
    } catch (error) {
      if (streamError === null) {
        yield {
          type: 'query.failed',
          error: error instanceof Error ? error.message : String(error),
        }
      }
      throw error
    }
  }
}
