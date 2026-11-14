import { describe, expect, it } from 'vitest'
import type { CatalogModel } from './catalog.js'
import { getModelType, inferRouteReason, modelsOfType, VirtualModelRegistry } from './virtualModels.js'

describe('virtual models and multimodal catalog types', () => {
  it('infers the dialogue reason through declarations while retaining ordinary system messages', () => {
    const marker = { id: 'declaration', role: 'system' as const, content: '', requestDeclaration: { version: 1 as const,
      target: { provider: 'fixture', model: 'model', endpoint: 'anthropic', replayBinding: 'a'.repeat(64) }, tools: [] } }
    const user = { role: 'user' as const, content: 'Continue' }
    expect(inferRouteReason([user, marker], 0)).toBe('user')
    expect(inferRouteReason([user, marker], 1)).toBe('retry')
    expect(inferRouteReason([user, { role: 'system', content: 'Repair instruction' }, marker], 0)).toBe('continuation')
  })

  it('filters catalog models by chat, image, and classifier types', () => {
    const models: CatalogModel[] = [
      { id: 'chat-default' },
      { id: 'img-gen-1', modelType: 'image' },
      { id: 'guard-cls-1', modelType: 'classifier' },
    ]
    expect(getModelType(models[0]!)).toBe('chat')
    expect(modelsOfType(models, 'chat').map(m => m.id)).toEqual(['chat-default'])
    expect(modelsOfType(models, 'image').map(m => m.id)).toEqual(['img-gen-1'])
    expect(modelsOfType(models, 'classifier').map(m => m.id)).toEqual(['guard-cls-1'])
  })

  it('routes virtual models by request reason and persists per-branch router state', async () => {
    const registry = new VirtualModelRegistry()
    registry.register({
      provider: 'openai',
      id: 'auto-router',
      name: 'Auto Router',
      route: req => {
        const count = typeof req.state === 'number' ? req.state + 1 : 1
        return req.reason === 'retry'
          ? { provider: 'openai', modelId: 'gpt-5-strong', thinkingLevel: 'high', state: count }
          : { provider: 'openai', modelId: 'gpt-5-fast', thinkingLevel: 'low', state: count }
      },
    })

    const first = await registry.resolve({
      provider: 'openai',
      modelId: 'auto-router',
      thinkingLevel: 'medium',
      reason: 'user',
      messages: [{ role: 'user', content: 'hi' }],
    })
    expect(first).toEqual({ provider: 'openai', modelId: 'gpt-5-fast', thinkingLevel: 'low', state: 1 })

    const retried = await registry.resolve({
      provider: 'openai',
      modelId: 'auto-router',
      thinkingLevel: 'medium',
      reason: 'retry',
      messages: [{ role: 'user', content: 'hi' }],
    })
    expect(retried).toEqual({ provider: 'openai', modelId: 'gpt-5-strong', thinkingLevel: 'high', state: 2 })
  })
})
