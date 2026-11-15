import type { AgentMessage } from '../agent/state.js'
import { lastContextMessageIndex } from '../agent/context.js'
import type { CatalogModel, ModelType } from './catalog.js'
import { captureVirtualDefinition, MAX_VIRTUAL_MODELS } from './virtual/capture.js'
import type { ModelRoute, ModelRouteReason, ModelRouteRequest, VirtualModelDefinition } from './virtual/contract.js'
export type { ModelRoute, ModelRouteReason, ModelRouteRequest, VirtualModelDefinition, VirtualModelMetadata } from './virtual/contract.js'

export const VIRTUAL_MODEL_API = 'cheers-virtual'

export function getModelType(model: Pick<CatalogModel, 'modelType'>): ModelType {
  return model.modelType ?? 'chat'
}

export function modelsOfType(models: readonly CatalogModel[], type: ModelType): CatalogModel[] {
  return models.filter(model => getModelType(model) === type)
}

export function inferRouteReason(messages: readonly AgentMessage[], attempt: number): ModelRouteReason {
  if (attempt > 0) return 'retry'
  const last = messages[lastContextMessageIndex(messages)]
  return last?.role === 'user' ? 'user' : 'continuation'
}

export class VirtualModelRegistry {
  private readonly definitions = new Map<string, VirtualModelDefinition>()
  private readonly states = new Map<string, unknown>()

  private key(provider: string, id: string): string {
    return `${provider}\0${id}`
  }

  register(definition: VirtualModelDefinition): () => void {
    if (this.definitions.size >= MAX_VIRTUAL_MODELS) throw new Error('Virtual model registration limit exceeded.')
    const captured = captureVirtualDefinition(definition)
    const key = this.key(captured.provider, captured.id)
    if (this.definitions.has(key)) throw new Error('Virtual model registration collision.')
    let active = true
    const owned = captureVirtualDefinition(captured, () => {
      if (!active || this.definitions.get(key) !== owned) throw new Error('Virtual model registration is retired.')
    })
    this.definitions.set(key, owned)
    return () => {
      active = false
      if (this.definitions.get(key) !== owned) return
      this.definitions.delete(key); this.states.delete(key)
    }
  }

  get(provider: string, id: string): VirtualModelDefinition | undefined {
    return this.definitions.get(this.key(provider, id))
  }

  list(): readonly VirtualModelDefinition[] {
    return [...this.definitions.values()]
  }

  async resolve(request: Omit<ModelRouteRequest, 'state'>): Promise<ModelRoute | undefined> {
    const { provider, modelId, reason, signal } = request
    const def = this.get(provider, modelId)
    if (!def) return undefined
    const k = this.key(provider, modelId)
    const state = reason === 'direct' ? undefined : this.states.get(k)
    const routed = await def.route({ ...request, state })
    if (signal) AbortSignal.prototype.throwIfAborted.call(signal)
    if (this.definitions.get(k) !== def) throw new Error('Virtual model registration is retired.')
    if (reason !== 'direct' && routed.state !== undefined) {
      this.states.set(k, routed.state)
    }
    return routed
  }
}
