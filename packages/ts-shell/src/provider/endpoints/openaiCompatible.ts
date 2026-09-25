import { readCompletionStream, type CompletedBody } from "../../turn/completion.js";
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
  path: PATH,
  headers: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
  body: (input) => ({
    model: input.model,
    messages: [
      ...(input.systemPrompt ? [{ role: "system" as const, content: input.systemPrompt }] : []),
      ...input.messages,
    ],
    ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
    ...(input.maxOutputTokens !== undefined ? { max_tokens: input.maxOutputTokens } : {}),
  }),
  // Already in the shared shape: this wire form is the one everything else was
  // flattened into, which is why the other readers convert to it.
  readBody: (body) => (body ?? {}) as CompletedBody,
  readStream: (body) => readCompletionStream(body),
});
