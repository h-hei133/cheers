import { endpointShape, isEventStream, type EndpointKind } from '../endpoints/index.js';
import type { CompletedBody } from '../../turn/completion.js';

/** Consume the declared response mode and always close an abandoned iterator. */
export async function readCompletion(kind: EndpointKind | undefined, response: Response): Promise<CompletedBody> {
  const shape = endpointShape(kind);
  if (shape.simpleResponse !== 'stream') return shape.readBody(await response.json());
  if (!isEventStream(response) || !response.body) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error('The account service did not return an event stream.');
  }
  const iterator = shape.readStream(response.body);
  try {
    for (;;) {
      const item = await iterator.next();
      if (!item.done) continue;
      const completion = item.value;
      return { choices: [{ message: completion.message, finish_reason: completion.finishReason }],
        usage: completion.usage, reasoning: completion.reasoning,
        ...(completion.reasoningSignature ? { reasoningSignature: completion.reasoningSignature } : {}) };
    }
  } finally { await iterator.return(undefined as never); }
}
