import { declareEndpoint, endpointShape } from './kinds.js';
import './openaiCompatible.js';
import './anthropicMessages.js';

// Native gateway declarations share the existing model-family wire codecs.
declareEndpoint('copilot-chat-completions', { ...endpointShape('openai-compatible'), serviceTiers: undefined });
declareEndpoint('copilot-messages', { ...endpointShape('anthropic-messages'), path: () => '/v1/messages', modelsPath: '/models' });
