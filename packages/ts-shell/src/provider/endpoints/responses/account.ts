import { declareEndpoint } from '../kinds.js';
import { responseBody } from './body.js';
import { readResponse } from './output.js';
import { readResponseStream } from './stream.js';
import type { SimpleRequest, TurnRequest } from '../kinds.js';

const TURN_STATE_HEADER = 'x-codex-turn-state';
const MAX_TURN_STATE_LENGTH = 4096;

export interface AccountTurnAffinity {
  read(input: { readonly endpoint?: string; readonly baseUrl: string; readonly replayBinding: string }): string | undefined;
  capture(input: { readonly endpoint?: string; readonly baseUrl: string; readonly replayBinding: string; readonly headers: Headers }): void;
}

/** Keep opaque routing state within one admitted model turn and physical target. */
export function createAccountTurnAffinity(): AccountTurnAffinity {
  let binding: string | undefined;
  let state: string | undefined;
  return {
    read(input) {
      return nativeAccountAddress(input.endpoint, input.baseUrl) && input.replayBinding === binding ? state : undefined;
    },
    capture(input) {
      if (!nativeAccountAddress(input.endpoint, input.baseUrl) || !input.replayBinding) return;
      const candidate = safeTurnState(input.headers.get(TURN_STATE_HEADER));
      if (candidate !== undefined) { binding = input.replayBinding; state = candidate; }
    },
  };
}

function nativeAccountAddress(endpoint: string | undefined, baseUrl: string): boolean {
  if (endpoint !== 'openai-account-responses') return false;
  try {
    const url = new URL(baseUrl);
    return url.protocol === 'https:' && url.hostname === 'chatgpt.com' && !url.port && !url.username && !url.password
      && !url.search && !url.hash && url.pathname.replace(/\/+$/, '') === '/backend-api';
  } catch { return false; }
}

function safeTurnState(value: string | null | undefined): string | undefined {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_TURN_STATE_LENGTH
    && /^[\x20-\x7e]+$/.test(value) ? value : undefined;
}

function accountBody(input: SimpleRequest | TurnRequest): Record<string, unknown> {
  if (input.maxOutputTokens !== undefined) throw new Error('This account service does not support an explicit maxOutputTokens limit.');
  if ('serviceTier' in input && input.serviceTier !== undefined) throw new Error('This account service does not support a service tier.');
  const body = responseBody(input, true);
  delete body.temperature;
  delete body.top_p;
  delete body.prompt_cache_retention;
  delete body.prompt_cache_options;
  return { ...body, instructions: input.systemPrompt || 'You are a helpful assistant.' };
}

const CODEX_SESSION_ID_MAX_LENGTH = 64;

function clampSessionId(sessionId: string | undefined): string | undefined {
  if (!sessionId) return undefined;
  const chars = Array.from(sessionId);
  return chars.length <= CODEX_SESSION_ID_MAX_LENGTH ? sessionId : chars.slice(0, CODEX_SESSION_ID_MAX_LENGTH).join('');
}

declareEndpoint('openai-account-responses', {
  usageInput: 'inclusive',
  opaqueReplay: true,
  contextFields: { system: 'instructions', conversation: 'input', tools: 'tools' },
  simpleResponse: 'stream',
  outputControl: 'provider',
  path: () => '/codex/responses',
  headers: () => ({ 'content-type': 'application/json', accept: 'text/event-stream',
    'OpenAI-Beta': 'responses=experimental', originator: 'cheers' }),
  requestHeaders: (input): Record<string, string> => {
    const sessionId = input.cacheRetention === 'none' ? undefined : clampSessionId(input.sessionId);
    const turnState = safeTurnState('accountTurnState' in input ? input.accountTurnState : undefined);
    return {
      ...(sessionId ? { 'session-id': sessionId, 'x-client-request-id': sessionId } : {}),
      ...(turnState ? { [TURN_STATE_HEADER]: turnState } : {}),
    };
  },
  body: accountBody,
  turnBody: accountBody,
  readBody: body => readResponse(body, true),
  readStream: (body, observe) => readResponseStream(body, true, observe),
});
