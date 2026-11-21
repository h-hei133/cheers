import { isRecord } from '../../../core/values/record.js';
import { declareEndpoint, type SimpleRequest, type TurnRequest } from '../kinds.js';
import { wireMessages } from '../openaiCompatible.js';
import { replayContent } from './replay.js';
import { readConversation, readConversationStream } from './stream.js';

const PROTOCOL = 'mistral-conversations-native';

function projectEntries(input: SimpleRequest, bridge: boolean) {
  const entries: Record<string, unknown>[] = [];
  const instructions = input.systemPrompt ? [input.systemPrompt] : [];
  for (const message of wireMessages(input, input.vision === true, bridge,
    (message, request) => replayContent(message, request, PROTOCOL))) {
    if (message.role === 'system') {
      if (typeof message.content === 'string' && message.content) instructions.push(message.content);
      continue;
    }
    if (message.role === 'tool') {
      if (typeof message.tool_call_id !== 'string' || typeof message.content !== 'string') {
        throw new Error('Conversation tool result has an invalid shape.');
      }
      entries.push({ type: 'function.result', tool_call_id: message.tool_call_id, result: message.content });
      continue;
    }
    if (message.content != null && (message.content !== '' || !Array.isArray(message.tool_calls))) {
      entries.push(message.role === 'assistant' ? { type: 'message.output', content: message.content }
        : { type: 'message.input', role: 'user', content: message.content });
    }
    if (!Array.isArray(message.tool_calls)) continue;
    for (const call of message.tool_calls as unknown[]) {
      if (!isRecord(call) || !isRecord(call.function) || typeof call.id !== 'string'
        || typeof call.function.name !== 'string' || typeof call.function.arguments !== 'string') {
        throw new Error('Conversation tool call has an invalid shape.');
      }
      entries.push({ type: 'function.call', tool_call_id: call.id, name: call.function.name, arguments: call.function.arguments });
    }
  }
  return { entries, instructions: instructions.join('\n\n') };
}

function requestBody(input: SimpleRequest, turn?: TurnRequest): Record<string, unknown> {
  const { entries, instructions } = projectEntries(input, turn?.assistantAfterToolResult === true);
  const tools = turn?.allowTools ? turn.tools : [];
  const completionArgs = {
    ...(input.supportsTemperature !== false && input.temperature !== undefined && !input.thinkingLevelName
      ? { temperature: input.temperature } : {}),
    ...(turn?.topP !== undefined ? { top_p: turn.topP } : {}),
    ...(input.maxOutputTokens !== undefined ? { max_tokens: input.maxOutputTokens } : {}),
    ...(input.reasoningEffort && input.thinkingLevelName ? { reasoning_effort: input.thinkingLevelName } : {}),
    tool_choice: tools.length ? 'auto' : 'none',
  };
  return { model: input.model, inputs: entries, ...(instructions ? { instructions } : {}),
    ...(tools.length ? { tools } : {}), completion_args: completionArgs,
    stream: Boolean(turn), store: false, handoff_execution: 'client' };
}

declareEndpoint(PROTOCOL, {
  usageInput: 'inclusive',
  opaqueReplay: true,
  contextFields: { conversation: 'inputs', system: 'instructions', tools: 'tools' },
  modelsPath: '/models',
  path: () => '/conversations',
  headers: (apiKey): Record<string, string> => apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
  body: input => requestBody(input),
  turnBody: input => requestBody(input, input),
  readBody: body => readConversation(body, PROTOCOL),
  readStream: (body, observe) => readConversationStream(body, PROTOCOL, observe),
});
