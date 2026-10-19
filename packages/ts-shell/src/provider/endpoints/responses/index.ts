import { declareEndpoint } from '../kinds.js';
import { responseBody } from './body.js';
import { readResponse } from './output.js';
import { readResponseStream } from './stream.js';

declareEndpoint('openai-responses', {
  contextFields: { system: 'instructions', conversation: 'input', tools: 'tools' },
  serviceTiers: ['default', 'auto', 'priority', 'flex'],
  path: () => '/responses',
  modelsPath: '/models',
  headers: key => ({ 'content-type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) }),
  body: input => responseBody(input, false),
  turnBody: input => responseBody(input, true),
  refreshBody: body => ({ ...body, max_output_tokens: 1 }),
  readBody: readResponse,
  readStream: readResponseStream,
});
