import { OpenAIModelAdapter } from './providers/openai/OpenAIModelAdapter.js'
import type { ModelProviderAdapter, ModelProviderConfig } from './types.js'

export function createModelProviderAdapter(
  config: ModelProviderConfig,
): ModelProviderAdapter {
  switch (config.provider) {
    case 'openai':
      return new OpenAIModelAdapter(config)
    default: {
      const exhaustive: never = config.provider
      throw new Error(`Unsupported model provider: ${String(exhaustive)}`)
    }
  }
}
