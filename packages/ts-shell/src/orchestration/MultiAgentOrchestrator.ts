import { QueryEngine } from '../core/query/QueryEngine.js'
import type { QueryEvent } from '../core/query/events.js'
import type { QueryRuntimeStateSeed } from '../core/query/runtimeState.js'
import type {
  AgentRunner,
  OrchestratorOptions,
  OrchestrationResult,
} from './types.js'

export class MultiAgentOrchestrator {
  private readonly engine: QueryEngine

  constructor(runAgent: AgentRunner) {
    this.engine = new QueryEngine({ runAgent })
  }

  async run(
    sessionId: string,
    initialPrompt: string,
    options: OrchestratorOptions & { runtimeSeed?: QueryRuntimeStateSeed } = {},
  ): Promise<OrchestrationResult> {
    return this.engine.submitMessage(sessionId, initialPrompt, options)
  }

  stream(
    sessionId: string,
    initialPrompt: string,
    options: OrchestratorOptions & { runtimeSeed?: QueryRuntimeStateSeed } = {},
  ): AsyncIterable<QueryEvent> {
    return this.engine.streamMessage(sessionId, initialPrompt, options)
  }
}
