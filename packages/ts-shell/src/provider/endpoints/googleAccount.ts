import { declareEndpoint, endpointShape } from './kinds.js';
import './googleGenAI.js';

// The own-client OAuth API uses the existing Gemini codec without API-key headers.
const api = endpointShape('google-generative-ai');
declareEndpoint('google-account-generative-ai', {
  ...api,
  headers: () => ({ 'content-type': 'application/json' }),
});
