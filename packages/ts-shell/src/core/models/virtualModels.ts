import type { AgentMessage } from '../agent/state.js'
import type { CatalogModel, ModelType } from './catalog.js'
import { captureVirtualDefinition, MAX_VIRTUAL_MODELS } from './virtual/capture.js'
import type { ModelRoute, ModelRouteReason, ModelRouteInput, CapturedVirtualModelDefinition, VirtualModelDefinition } from './virtual/contract.js'
export type { ModelRoute, ModelRouteReason, ModelRouteInput, ModelRouteRequest, ModelRouteSignal, CapturedVirtualModelDefinition, VirtualModelDefinition, VirtualModelMetadata } from './virtual/contract.js'

export const VIRTUAL_MODEL_API = 'cheers-virtual'

export function getModelType(model: Pick<CatalogModel, 'modelType'>): ModelType {
  return model.modelType ?? 'chat'
}

export function modelsOfType(models: readonly CatalogModel[], type: ModelType): CatalogModel[] {
  return models.filter(model => getModelType(model) === type)
}

export function inferRouteReason(messages: readonly AgentMessage[], attempt: number): ModelRouteReason {
  if (attempt > 0) return 'retry'
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index]!.role === 'assistant') break
    if (messages[index]!.role === 'user') return 'user'
  }
  return 'continuation'
}

export class VirtualModelRegistry {
  private readonly definitions = new Map<string, CapturedVirtualModelDefinition>()

  constructor(private readonly source?: () => readonly CapturedVirtualModelDefinition[]) {}

  private key(provider: string, id: string): string {
    return `${provider}\0${id}`
  }

  register(definition: VirtualModelDefinition): () => void {
    if (this.source) throw new Error('Session registrations belong to their contribution owner.')
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
      this.definitions.delete(key)
    }
  }

  get(provider: string, id: string): CapturedVirtualModelDefinition | undefined {
    if (this.source) return this.source().find(definition => definition.provider === provider && definition.id === id)
    return this.definitions.get(this.key(provider, id))
  }

  list(): readonly CapturedVirtualModelDefinition[] {
    return this.source ? this.source() : [...this.definitions.values()]
  }

  async resolve(request: ModelRouteInput): Promise<ModelRoute | undefined> {
    const { provider, modelId, reason, signal } = request
    const def = this.get(provider, modelId)
    if (!def) return undefined
    const state = reason === 'direct' ? undefined : request.state
    const routed = await def.route({ ...request, state })
    if (signal) AbortSignal.prototype.throwIfAborted.call(signal)
    if (this.get(provider, modelId) !== def) throw new Error('Virtual model registration is retired.')
    return routed
  }
}
