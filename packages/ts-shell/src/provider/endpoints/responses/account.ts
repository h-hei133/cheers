import { declareEndpoint } from '../kinds.js';
import { responseBody } from './body.js';
import { readResponse } from './output.js';
import { readResponseStream } from './stream.js';
import type { SimpleRequest, TurnRequest } from '../kinds.js';

function accountBody(input: SimpleRequest | TurnRequest): Record<string, unknown> {
  if (input.maxOutputTokens !== undefined) throw new Error('This account service does not support an explicit maxOutputTokens limit.');
  if ('serviceTier' in input && input.serviceTier !== undefined) throw new Error('This account service does not support a service tier.');
  const body = responseBody(input, true);
  delete body.temperature;
  delete body.top_p;
  return { ...body, instructions: input.systemPrompt || 'You are a helpful assistant.' };
}

declareEndpoint('openai-account-responses', {
  opaqueReplay: true,
  contextFields: { system: 'instructions', conversation: 'input', tools: 'tools' },
  simpleResponse: 'stream',
  outputControl: 'provider',
  path: () => '/codex/responses',
  headers: () => ({ 'content-type': 'application/json', accept: 'text/event-stream',
    'OpenAI-Beta': 'responses=experimental', originator: 'cheers' }),
  body: accountBody,
  turnBody: accountBody,
  readBody: body => readResponse(body, true),
  readStream: body => readResponseStream(body, true),
});
