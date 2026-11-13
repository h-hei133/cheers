import type { AgentMessage } from '../agent/state.js'
import type { CatalogModel, ModelType, ThinkingLevel } from './catalog.js'

export const VIRTUAL_MODEL_API = 'cheers-virtual'

export type ModelRouteReason = 'user' | 'continuation' | 'retry' | 'direct'

export interface ModelRouteRequest<TState = unknown> {
  readonly provider: string
  readonly modelId: string
  readonly thinkingLevel: ThinkingLevel
  readonly reason: ModelRouteReason
  readonly state?: TState
  readonly messages: readonly AgentMessage[]
  readonly signal?: AbortSignal
}

export interface ModelRoute<TState = unknown> {
  readonly provider: string
  readonly modelId: string
  readonly thinkingLevel?: ThinkingLevel
  readonly state?: TState
}

export interface VirtualModelDefinition<TState = unknown> {
  readonly provider: string
  readonly id: string
  readonly name: string
  readonly thinkingLevels?: readonly ThinkingLevel[]
  readonly contextWindow?: number
  readonly maxTokens?: number
  readonly route: (request: ModelRouteRequest<TState>) => ModelRoute<TState> | Promise<ModelRoute<TState>>
}

export function getModelType(model: Pick<CatalogModel, 'modelType'>): ModelType {
  return model.modelType ?? 'chat'
}

export function modelsOfType(models: readonly CatalogModel[], type: ModelType): CatalogModel[] {
  return models.filter(model => getModelType(model) === type)
}

export function inferRouteReason(messages: readonly AgentMessage[], attempt: number): ModelRouteReason {
  if (attempt > 0) return 'retry'
  const last = messages.at(-1)
  return last?.role === 'user' ? 'user' : 'continuation'
}

export class VirtualModelRegistry {
  private readonly definitions = new Map<string, VirtualModelDefinition>()
  private readonly states = new Map<string, unknown>()

  private key(provider: string, id: string): string {
    return `${provider}\0${id}`
  }

  register(definition: VirtualModelDefinition): void {
    this.definitions.set(this.key(definition.provider, definition.id), definition)
  }

  get(provider: string, id: string): VirtualModelDefinition | undefined {
    return this.definitions.get(this.key(provider, id))
  }

  list(): readonly VirtualModelDefinition[] {
    return [...this.definitions.values()]
  }

  async resolve(request: Omit<ModelRouteRequest, 'state'>): Promise<ModelRoute | undefined> {
    const def = this.get(request.provider, request.modelId)
    if (!def) return undefined
    const k = this.key(request.provider, request.modelId)
    const state = request.reason === 'direct' ? undefined : this.states.get(k)
    const routed = await def.route({ ...request, state })
    if (request.reason !== 'direct' && routed.state !== undefined) {
      this.states.set(k, routed.state)
    }
    return routed
  }
}
