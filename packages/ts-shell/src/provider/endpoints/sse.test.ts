import { describe, expect, it } from "vitest";
import { endpointShape } from "./index.js";
import type { StreamedCompletion } from "../../turn/completion.js";
import type { ObserveToolArguments, WireToolArguments } from "../../turn/preview/model.js";

function byteStream(text: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({ start(controller) {
    // Split field names, CRLF pairs and multibyte characters at transport boundaries.
    for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
    controller.close();
  } });
}

async function read(endpoint: string, wire: string, observe?: ObserveToolArguments): Promise<StreamedCompletion> {
  const stream = endpointShape(endpoint).readStream(byteStream(wire), observe);
  let next = await stream.next();
  while (!next.done) next = await stream.next();
  return next.value;
}

it.each([
  'openai-compatible', 'copilot-chat-completions', 'mistral-chat-completions', 'mistral-conversations',
  'anthropic-messages', 'copilot-messages', 'openai-responses', 'openai-account-responses', 'azure-openai-responses',
])('observes indexed tool argument fragments on %s and retains their exact final text', async endpoint => {
  const first = '{"path":"src/\\u0061.ts",';
  const second = '"tags":[{"x":"a,}"}]}';
  const call = { id: 'fc_item', type: 'function_call', name: 'read', call_id: 'AbCd12345', arguments: '' };
  const events = endpoint.endsWith('messages') ? [
    { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: call.call_id, name: call.name } },
    { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: first } },
    { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: second } },
    { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
  ] : endpoint.endsWith('responses') ? [
    { type: 'response.output_item.added', output_index: 0, item: call },
    { type: 'response.function_call_arguments.delta', output_index: 0, item_id: call.id, delta: first },
    { type: 'response.function_call_arguments.delta', output_index: 0, item_id: call.id, delta: second },
    { type: 'response.completed', response: { id: 'response', status: 'completed', output: [{ ...call, arguments: first + second }] } },
  ] : [
    { choices: [{ delta: { tool_calls: [{ index: 0, id: call.call_id, function: { name: call.name, arguments: '' } }] } }] },
    { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: first } }] } }] },
    { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: second } }] }, finish_reason: 'tool_calls' }] },
  ];
  const previews: WireToolArguments[] = [];
  const result = await read(endpoint, events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n',
    preview => previews.push(preview));
  expect(previews[0]).toMatchObject({ index: 0, name: 'read' });
  expect(previews).toHaveLength(3);
  expect(previews.slice(1)).toEqual([{ index: 0, name: 'read', delta: first }, { index: 0, name: 'read', delta: second }]);
  expect(result.finishReason).toBe('tool_calls');
  expect(result.message.tool_calls).toEqual([{ id: call.call_id, type: 'function', function: { name: 'read', arguments: first + second } }]);
});

describe.each(["openai-compatible", "anthropic-messages", "google-generative-ai", "google-vertex"])("%s SSE data lines", endpoint => {
  const payload = (text: string) => endpoint === "openai-compatible"
    ? { choices: [{ delta: { content: text }, finish_reason: "stop" }] }
    : endpoint === "anthropic-messages"
    ? { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } }
    : { candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }] };
  const terminal = endpoint === "anthropic-messages" ? { type: "message_delta", delta: { stop_reason: "end_turn" } } : {};

  it.each(["\n", "\r\n", "\r"])("reads multiline JSON with %j lines across byte boundaries", async newline => {
    const wire = [": heartbeat", "id: frame", "event: message",
      ...JSON.stringify(payload("Hello 世界"), null, 2).split("\n").map(line => `data: ${line}`), "", "",
    ].join(newline) + `data: ${JSON.stringify(terminal)}${newline}${newline}`;
    const result = await read(endpoint, wire);
    expect(result.message.content).toBe("Hello 世界");
    expect(result.finishReason).toBe("stop");
  });

  it("does not concatenate an invalid split JSON string into invented model text", async () => {
    const broken = JSON.stringify(payload("SHOULD_JOIN")).replace("SHOULD_JOIN", "SHOULD\nJOIN");
    const wire = broken.split("\n").map(line => `data: ${line}`).join("\n") + "\n\n" +
      `data: ${JSON.stringify(payload("valid"))}\n\n` + `data: ${JSON.stringify(terminal)}\n\n`;
    const result = await read(endpoint, wire);
    expect(result.message.content).toBe("valid");
    expect(result.finishReason).toBe(endpoint.startsWith('google-') ? 'error' : 'stop');
    if (endpoint.startsWith('google-')) {
      expect(result.message.tool_calls).toBeUndefined();
      expect(result.reasoningSignature).toBeUndefined();
    }
  });
});

it.each(["anthropic-messages", "google-generative-ai", "google-vertex"])("retains an independent usage event after %s completion", async endpoint => {
  const events = endpoint === "anthropic-messages" ? [
    { type: "message_start", message: { usage: { input_tokens: 100 } } },
    { type: "message_delta", delta: { stop_reason: "end_turn" } },
    { type: "message_delta", usage: { output_tokens: 7 } },
  ] : [
    { candidates: [{ finishReason: "STOP" }] },
    { usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 4, thoughtsTokenCount: 3 } },
  ];
  const result = await read(endpoint, events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(""));
  expect(result.finishReason).toBe("stop");
  expect(result.usage).toMatchObject({ prompt_tokens: 100, completion_tokens: 7 });
});
