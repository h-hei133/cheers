import {
  formatNonVisionFallback,
  toOpenAIImageUrlBlock,
  type OpenAIImageUrlBlock,
} from "../../model-adapters/multimodal.js";
import { readCompletionStream, type CompletedBody } from "../../turn/completion.js";
import type { ChatMessage } from "../../turn/prompt.js";
import { declareEndpoint } from "./kinds.js";

/**
 * The default wire shape.
 *
 * The one most providers speak, and what the shell sent before there was more
 * than one: a `system` role inside `messages`, tools under a nested `function`
 * object, and a stream of uniform chunks. Kept as its own module rather than left
 * inline in the registry so the registry stays a registry, and so the second
 * protocol has a sibling to be written beside rather than an exception to be
 * carved out of.
 */

/** Where a request goes, appended to the base URL. */
const PATH = "/chat/completions";

declareEndpoint("openai-compatible", {
  // The model travels in the body, so the path is the same for every one.
  path: () => PATH,
  headers: (apiKey) => ({ ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) }),
  requestHeaders: (input) => {
    if (input.provider !== "github-copilot") return {};
    const last = input.messages[input.messages.length - 1];
    const hasImages = input.messages.some(
      (message) => Array.isArray(message.content) && message.content.some((part) => part.type === "image"),
    );
    return {
      "Editor-Version": "vscode/1.107.0",
      "Editor-Plugin-Version": "copilot-chat/0.35.0",
      "Copilot-Integration-Id": "vscode-chat",
      "User-Agent": "GitHubCopilotChat/0.35.0",
      "X-Initiator": last && last.role !== "user" ? "agent" : "user",
      "Openai-Intent": "conversation-edits",
      ...(hasImages ? { "Copilot-Vision-Request": "true" } : {}),
    };
  },
  body: (input) => ({
    model: input.model,
    messages: [
      ...(input.systemPrompt ? [{ role: "system" as const, content: input.systemPrompt }] : []),
      ...input.messages,
    ],
    // Gated the same way the full request gates it. A caller that declares the
    // model rejects a temperature gets a request without one, whether or not the
    // call carries tools.
    ...(input.temperature !== undefined && input.supportsTemperature !== false
      ? { temperature: input.temperature }
      : {}),
    ...(input.maxOutputTokens !== undefined ? { max_tokens: input.maxOutputTokens } : {}),
  }),
  /**
   * The full turn: the conversation, the tools, and the model's own vocabulary
   * for its reasoning level.
   *
   * Every value here is chosen by the caller and merely written down by the
   * protocol, which is what makes a third protocol a matter of writing this
   * function rather than editing the turn loop.
   */
  turnBody: (input) => ({
    model: input.model,
    messages: [
      { role: input.systemRole, content: input.systemPrompt },
      // A bare string, or an array of parts when the message carries images.
      // The bridging and the compaction the caller already did are its business,
      // not the protocol's; what is left here is how this wire writes a message.
      ...input.messages.map((message) => ({
        ...message,
        content: wireContent(message.content, input.vision),
      })),
    ],
    // Omitted rather than sent with `tool_choice: "none"`, which is what the
    // other protocol already did. Both ways stop the call, but keeping the
    // schemas spends tokens on declarations the model is forbidden to use — and
    // the two protocols disagreeing about what a model can even see is how one
    // run and the next behave differently on the same setting.
    ...(input.allowTools && input.tools.length > 0
      ? { tools: input.tools, tool_choice: "auto" as const }
      : {}),
    stream: true,
    stream_options: { include_usage: true },
    // Omitted where the model is known to reject it, and where thinking is on:
    // a reasoning mode and a sampling temperature are alternatives, not
    // companions, and a host that enforces that rejects the whole request.
    ...(input.supportsTemperature !== false && !input.thinkingLevelName
      ? { temperature: input.temperature }
      : {}),
    // The model's own name for the level; sent only where the model accepts it,
    // because a host that does not know the field rejects the whole request.
    ...(input.reasoningEffort && input.thinkingLevelName
      ? { reasoning_effort: input.thinkingLevelName }
      : {}),
    ...(input.topP !== undefined ? { top_p: input.topP } : {}),
    // The request's own ceiling wins; the model's applies when the request did
    // not set one. Neither set means the field is left off and the host decides.
    ...(input.maxOutputTokens !== undefined
      ? { [input.maxTokensField]: input.maxOutputTokens }
      : {}),
  }),
  // Already in the shared shape: this wire form is the one everything else was
  // flattened into, which is why the other readers convert to it.
  readBody: (body) => (body ?? {}) as CompletedBody,
  readStream: (body) => readCompletionStream(body),
});

/**
 * One message's content, as this wire takes it.
 *
 * A string stays a string, which is what every request looked like before images
 * existed. A message with images becomes the array form, because sending the
 * block array as-is would serialise to `[object Object]` and the model would read
 * that as the message.
 */
function wireContent(
  content: ChatMessage["content"],
  vision: boolean,
): string | readonly ({ readonly type: "text"; readonly text: string } | OpenAIImageUrlBlock)[] {
  if (typeof content === "string") return content;
  if (content === null || content === undefined) return "";
  if (!vision) {
    // The model cannot read a picture, so it is given the words for one instead.
    // Sending the image anyway fails the whole request, which loses the text the
    // user also wrote; describing it loses only what the model could not have
    // used.
    return content
      .map((block) => (block.type === "text" ? block.text : formatNonVisionFallback(block)))
      .join("\n");
  }
  return content.map((block) =>
    block.type === "text" ? { type: "text" as const, text: block.text } : toOpenAIImageUrlBlock(block),
  );
}
