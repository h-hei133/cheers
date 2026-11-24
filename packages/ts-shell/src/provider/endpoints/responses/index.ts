import { declareEndpoint } from '../kinds.js';
import { responseBody } from './body.js';
import { readResponse } from './output.js';
import { readResponseStream } from './stream.js';

const MIN_OUTPUT_TOKENS = 16;

declareEndpoint('openai-responses', {
  usageInput: 'inclusive',
  opaqueReplay: true,
  contextFields: { system: 'instructions', conversation: 'input', tools: 'tools' },
  serviceTiers: ['default', 'auto', 'priority', 'flex'],
  path: () => '/responses',
  modelsPath: '/models',
  headers: key => ({ 'content-type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) }),
  body: input => responseBody(input, false),
  turnBody: input => responseBody(input, true),
  refreshOutputTokens: MIN_OUTPUT_TOKENS,
  refreshBody: body => ({ ...body, max_output_tokens: MIN_OUTPUT_TOKENS }),
  readBody: readResponse,
  readStream: (body, observe) => readResponseStream(body, false, observe),
});
