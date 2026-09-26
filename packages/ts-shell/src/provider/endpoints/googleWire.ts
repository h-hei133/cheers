/**
 * The Google wire shape, shared by both of its endpoints.
 *
 * Two endpoints with the same request and response shapes but different hosts,
 * credentials and path layouts. Keeping the translation here and the differences
 * in their own modules means one set of translation bugs rather than two.
 *
 * Three things differ from every other protocol here and none is cosmetic:
 *
 *   - The assistant's role is called `model`, and a message is a list of parts
 *     rather than a string.
 *   - A tool's result is a `functionResponse` part inside a user turn, and the
 *     API requires the responses to one turn's calls to arrive together — so they
 *     are merged rather than emitted one per result.
 *   - Reasoning carries an opaque `thoughtSignature` that has to be handed back
 *     exactly where it came from. Moving one to a different part, or dropping it,
 *     makes the model unable to continue its own train of thought.
 */

/** A part of a message. The wire treats the field names as the discriminator. */
export interface GooglePart {
  readonly text?: string;
  readonly thought?: boolean;
  readonly thoughtSignature?: string;
  readonly functionCall?: { readonly name?: string; readonly args?: Record<string, unknown>; readonly id?: string };
  readonly functionResponse?: {
    readonly name: string;
    readonly response: Record<string, unknown>;
    readonly id?: string;
  };
}

/** One conversation turn. The role is `user` or `model`. */
export interface GoogleContent {
  readonly role?: string;
  readonly parts: readonly GooglePart[];
}

/** The request, as both endpoints spell it. */
export interface GoogleRequestBody {
  readonly contents: readonly GoogleContent[];
  readonly systemInstruction?: { readonly parts: readonly { readonly text: string }[] };
  readonly generationConfig?: Record<string, unknown>;
  readonly tools?: readonly { readonly functionDeclarations: readonly Record<string, unknown>[] }[];
  readonly toolConfig?: { readonly functionCallingConfig: { readonly mode: string } };
}

/** What a message carries, in the terms this file needs. */
export interface GoogleMessage {
  readonly role: "system" | "user" | "assistant" | "tool";
  readonly content?: string | null;
  readonly tool_calls?: readonly {
    readonly id: string;
    readonly function: { readonly name: string; readonly arguments: string };
  }[];
  readonly tool_call_id?: string;
  /** The name of the tool a result belongs to; the protocol matches on it. */
  readonly toolName?: string;
  readonly reasoning?: { readonly text: string; readonly signature?: string; readonly redacted?: boolean };
}

/** The text of a message whose content may be absent. */
export function textOf(content: string | null | undefined): string {
  return typeof content === "string" ? content : "";
}

/** Arguments as an object, or an empty one for text that is not JSON. */
export function parseArguments(arguments_: string): Record<string, unknown> {
  try {
    const parsed = arguments_ ? (JSON.parse(arguments_) as unknown) : {};
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * The conversation in Google's shape.
 *
 * The merge of consecutive results is a correctness requirement rather than a
 * tidy-up: the API rejects a request whose count of response parts does not match
 * its count of call parts, and one result per turn is how that happens.
 */
export function convertContents(messages: readonly GoogleMessage[]): GoogleContent[] {
  const contents: GoogleContent[] = [];

  for (const message of messages) {
    if (message.role === "system") continue;

    if (message.role === "tool") {
      const part: GooglePart = {
        functionResponse: {
          // The protocol identifies a result by the tool's name, not by the id
          // the call carried, so the name has to travel with the result.
          name: message.toolName ?? "unknown",
          response: { output: textOf(message.content) },
          ...(message.tool_call_id ? { id: message.tool_call_id } : {}),
        },
      };
      const previous = contents[contents.length - 1];
      if (previous?.role === "user" && previous.parts.some((existing) => existing.functionResponse)) {
        contents[contents.length - 1] = { role: "user", parts: [...previous.parts, part] };
      } else {
        contents.push({ role: "user", parts: [part] });
      }
      continue;
    }

    if (message.role === "user") {
      const text = textOf(message.content);
      if (text) contents.push({ role: "user", parts: [{ text }] });
      continue;
    }

    const parts: GooglePart[] = [];
    if (message.reasoning?.text) {
      // The signature goes back with the text it covers, in the same part. A
      // signed block that is moved or dropped leaves the model unable to pick up
      // its own reasoning.
      parts.push({
        text: message.reasoning.text,
        thought: true,
        ...(message.reasoning.signature ? { thoughtSignature: message.reasoning.signature } : {}),
      });
    }
    const text = textOf(message.content);
    if (text) parts.push({ text });
    for (const call of message.tool_calls ?? []) {
      parts.push({
        functionCall: {
          name: call.function.name,
          args: parseArguments(call.function.arguments),
          id: call.id,
        },
      });
    }
    if (parts.length > 0) contents.push({ role: "model", parts });
  }
  return contents;
}

/** The tool declarations, in the shape both endpoints take. */
export function convertTools(
  tools: ReadonlyArray<{ readonly type: string; readonly function: { readonly name: string; readonly description?: string; readonly parameters: Record<string, unknown> } }>,
): { readonly functionDeclarations: readonly Record<string, unknown>[] }[] | undefined {
  if (tools.length === 0) return undefined;
  return [
    {
      functionDeclarations: tools.map((tool) => ({
        name: tool.function.name,
        description: tool.function.description ?? "",
        // The shape the API reads is a JSON Schema under `parameters`.
        parameters: tool.function.parameters,
      })),
    },
  ];
}

/** Where the thinking budget is stated, when a level was requested. */
export function thinkingConfigFor(budgetTokens: number | undefined): Record<string, unknown> | undefined {
  if (budgetTokens === undefined) return undefined;
  return { thinkingConfig: { thinkingBudget: budgetTokens, includeThoughts: true } };
}
