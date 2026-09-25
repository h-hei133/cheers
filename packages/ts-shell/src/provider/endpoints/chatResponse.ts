import { readAnthropicBody } from "./anthropicMessages.js";
import type { EndpointKind } from "./chatRequest.js";

/**
 * The text of a non-streamed chat answer, whichever endpoint sent it.
 *
 * A caller that wants only the text — a summarizer, a side question — should not
 * have to know which protocol answered. Reading the default shape from an
 * endpoint that uses another finds no text at all and reports an empty answer
 * for a reply that arrived complete, which is the failure this exists to
 * prevent.
 */
export function readChatText(endpoint: EndpointKind | undefined, body: unknown): string | undefined {
  if (endpoint === "anthropic-messages") {
    const content = readAnthropicBody(body).choices[0]?.message.content;
    return content ? content : undefined;
  }

  const payload = (body ?? {}) as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content;
  return content ? content : undefined;
}
