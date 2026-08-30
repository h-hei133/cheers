import { OpenAIModelAdapter } from './providers/openai/OpenAIModelAdapter.js'
import { AnthropicModelAdapter } from './providers/anthropic/AnthropicModelAdapter.js'
import type { ModelProviderAdapter, ModelProviderConfig } from './types.js'

export function createModelProviderAdapter(
  config: ModelProviderConfig,
): ModelProviderAdapter {
  switch (config.provider) {
    case 'openai':
    case 'openai-compatible':
    case 'antigravity':
      return new OpenAIModelAdapter(config)
    case 'anthropic':
    case 'claudecode':
      return new AnthropicModelAdapter(config)
    case 'google':
      return new OpenAIModelAdapter(config) // Can be extended with Google adapter
    default: {
      const exhaustive: never = config.provider
      throw new Error(`Unsupported model provider: ${String(exhaustive)}`)
    }
  }
}
