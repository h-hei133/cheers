import type { ChatMessage } from "../../turn/prompt.js";
import { anthropicRequestBody } from "./anthropicMessages.js";

/**
 * One chat request, in whichever shape the endpoint wants.
 *
 * Three places send a model request: the turn itself, the summarizer, and the
 * compaction summarizer. Each used to build its own URL and body, which was
 * fine while there was one shape — the copies were identical. A second endpoint
 * kind makes them differ, and three copies of "which endpoint wants what" is
 * three chances for one of them to be missed.
 *
 * The turn's own request is not built here: it carries tools, streaming and a
 * listener, and folding that in would make this a worse version of it. What is
 * shared is the part that is genuinely the same question everywhere — where the
 * request goes, and what it looks like when it has no tools.
 */

export type EndpointKind = "openai-compatible" | "anthropic-messages";

export interface SimpleChatRequestInput {
  readonly endpoint?: EndpointKind;
  readonly baseUrl: string;
  readonly model: string;
  readonly messages: readonly ChatMessage[];
  /** A system instruction, when the caller has one. */
  readonly systemPrompt?: string;
  readonly maxOutputTokens?: number;
  readonly temperature?: number;
}

/**
 * The path a request goes to.
 *
 * The two endpoints disagree about it, so it is derived rather than configured:
 * a base URL names the host and the version prefix, and the resource is a
 * property of the protocol.
 */
function chatPath(endpoint: EndpointKind | undefined): string {
  return endpoint === "anthropic-messages" ? "/messages" : "/chat/completions";
}

/** The URL a chat request goes to. */
export function chatUrl(baseUrl: string, endpoint: EndpointKind | undefined): string {
  return `${baseUrl.replace(/\/+$/, "")}${chatPath(endpoint)}`;
}

/** The body a chat request sends. */
export function chatBody(input: SimpleChatRequestInput): Record<string, unknown> {
  if (input.endpoint === "anthropic-messages") {
    return anthropicRequestBody({
      model: input.model,
      systemPrompt: input.systemPrompt ?? "",
      messages: input.messages,
      tools: [],
      allowTools: false,
      ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
      ...(input.maxOutputTokens !== undefined ? { maxOutputTokens: input.maxOutputTokens } : {}),
    });
  }

  return {
    model: input.model,
    messages: [
      ...(input.systemPrompt ? [{ role: "system" as const, content: input.systemPrompt }] : []),
      ...input.messages,
    ],
    ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
    ...(input.maxOutputTokens !== undefined ? { max_tokens: input.maxOutputTokens } : {}),
  };
}
