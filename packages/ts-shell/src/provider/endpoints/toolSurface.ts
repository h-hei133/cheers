import type { ToolDefinition } from '../../tools/types.js';
import { endpointShape, type TurnRequest } from './index.js';

/** The exact tool declarations one endpoint would put on the wire. */
export interface ToolWireSurface {
  readonly endpoint: string;
  readonly text: string;
  readonly bytes: number;
  readonly characters: number;
}

function schema(tool: ToolDefinition): TurnRequest['tools'][number] {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.argsSchema,
    },
  };
}

function requestFor(tools: readonly ToolDefinition[]): TurnRequest {
  return {
    model: '',
    systemPrompt: '',
    messages: [],
    tools: tools.map(schema),
    allowTools: true,
    vision: false,
    temperature: 0,
    systemRole: 'system',
    reasoningEffort: false,
    maxTokensField: 'max_tokens',
    assistantAfterToolResult: false,
  };
}

function declarations(body: Record<string, unknown>): unknown {
  const config = body.toolConfig;
  if (config && typeof config === 'object' && Array.isArray((config as { tools?: unknown }).tools)) {
    return (config as { tools: unknown[] }).tools;
  }
  return Array.isArray(body.tools) ? body.tools : [];
}

/** Serialize only the declaration block, not the surrounding conversation. */
export function toolWireSurface(tools: readonly ToolDefinition[], endpoint: string): ToolWireSurface {
  const body = endpointShape(endpoint).turnBody(requestFor(tools));
  const text = JSON.stringify(declarations(body));
  return {
    endpoint,
    text,
    bytes: Buffer.byteLength(text, 'utf8'),
    characters: text.length,
  };
}
