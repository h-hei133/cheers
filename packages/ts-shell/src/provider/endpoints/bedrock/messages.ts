import type { ChatMessage } from "../../../turn/prompt.js";
import { formatNonVisionFallback, messageToText, type ImageContent } from "../../../model-adapters/multimodal.js";

/** A block in a user turn. */
type UserBlock =
  | { readonly text: string }
  | { readonly image: { readonly format: string; readonly source: { readonly bytes: string } } }
  | { readonly toolResult: { readonly toolUseId: string; readonly content: ReadonlyArray<{ text: string }>; readonly status: "success" | "error" } };

/** A block in an assistant turn. */
type AssistantBlock =
  | { readonly text: string }
  | { readonly toolUse: { readonly toolUseId: string; readonly name: string; readonly input: unknown } }
  | { readonly reasoningContent: { readonly reasoningText: { readonly text: string; readonly signature?: string } } };

export interface WireMessage {
  readonly role: "user" | "assistant";
  readonly content: ReadonlyArray<UserBlock | AssistantBlock>;
}

/**
 * The conversation in this protocol's shape.
 *
 * Turns are merged rather than emitted one per message. The protocol takes
 * alternating turns whose content is a list of blocks, so a tool's result and
 * anything the user said in the same turn belong in one entry — emitting them
 * separately would produce two user turns in a row, which is not a shape it
 * accepts.
 */
export function convertMessages(messages: readonly ChatMessage[], vision: boolean): WireMessage[] {
  const wire: WireMessage[] = [];
  let pendingImages: ImageContent[] = [];

  const pushUser = (block: UserBlock): void => {
    const previous = wire[wire.length - 1];
    if (previous && previous.role === "user") {
      wire[wire.length - 1] = { role: "user", content: [...previous.content, block] };
      return;
    }
    wire.push({ role: "user", content: [block] });
  };

  for (const message of messages) {
    if (message.role === "system") continue;
    if (message.role !== "tool" && pendingImages.length) {
      pushUserBlocks(pushUser, pendingImages, vision);
      pendingImages = [];
    }

    if (message.role === "tool") {
      pushUser({
        toolResult: {
          toolUseId: message.tool_call_id ?? "",
          content: [{ text: messageToText(message.content, { placeholderForImages: !vision }) || '(see attached image)' }],
          // The conversation carries no success marker, so every result is
          // reported as one. The text is where a failure is described, and
          // claiming the opposite of what the text says would be worse than
          // repeating it.
          status: "success",
        },
      });
      if (vision && Array.isArray(message.content)) pendingImages.push(...message.content.filter((block): block is ImageContent => block.type === 'image'));
      continue;
    }

    if (message.role === "user") {
      pushUserBlocks(pushUser, message.content, vision);
      continue;
    }

    const blocks: AssistantBlock[] = [];
    // Signed reasoning goes first, because that is the order it was produced in
    // and the order this protocol expects it back. A turn carrying a tool call
    // has to bring the signed block that preceded it.
    if (message.reasoning?.text && message.reasoning.signature) {
      blocks.push({
        reasoningContent: {
          reasoningText: { text: message.reasoning.text, signature: message.reasoning.signature },
        },
      });
    }
    const text = textOf(message.content);
    if (text) blocks.push({ text });
    for (const call of message.tool_calls ?? []) {
      blocks.push({
        toolUse: {
          toolUseId: call.id,
          name: call.function.name,
          input: safeParse(call.function.arguments),
        },
      });
    }
    if (blocks.length > 0) {
      const previous = wire[wire.length - 1];
      if (previous && previous.role === "assistant") {
        wire[wire.length - 1] = { role: "assistant", content: [...previous.content, ...blocks] };
      } else {
        wire.push({ role: "assistant", content: blocks });
      }
    }
  }
  if (pendingImages.length) pushUserBlocks(pushUser, pendingImages, vision);
  return wire;
}

type PushUser = (block: UserBlock) => void;

/** The text of a message whose content may be a string or a list of blocks. */
function textOf(content: ChatMessage["content"]): string {
  if (typeof content === "string") return content;
  if (!content) return "";
  return content.map((block) => (block.type === "text" ? block.text : "")).join("");
}

/**
 * A user message's blocks in this protocol's shape.
 *
 * Images retain their bytes only when the model declares vision support.
 * Otherwise the shared text fallback preserves their place in the conversation.
 * A block this code does not recognize is
 * carried as its text rather than dropped, so an unknown shape costs the
 * picture rather than the words beside it.
 */
function pushUserBlocks(pushUser: PushUser, content: ChatMessage["content"], vision: boolean): void {
  if (typeof content === "string") {
    if (content) pushUser({ text: content });
    return;
  }
  if (!content) return;
  for (const block of content) {
    if (block.type === "text") {
      if (block.text) pushUser({ text: block.text });
      continue;
    }
    if (block.type === "image") {
      if (vision !== true) {
        pushUser({ text: formatNonVisionFallback(block) });
        continue;
      }
      const format = imageFormat(block.mimeType);
      if (!format) {
        // Named rather than silently sent: the API would reject the whole
        // request and blame a field the user never set, so the reason the
        // picture is missing is stated where the picture would have been.
        pushUser({ text: `[an image of type ${block.mimeType} cannot be sent to this model]` });
        continue;
      }
      pushUser({
        image: {
          format,
          source: { bytes: block.data },
        },
      });
      continue;
    }
    const fallback: string = (block as { readonly text?: string }).text ?? "";
    if (fallback) pushUser({ text: fallback });
  }
}

/** The four formats this protocol accepts, and nothing else. */
const CONVERSE_IMAGE_FORMATS: Record<string, true> = {
  png: true,
  jpeg: true,
  gif: true,
  webp: true,
};

/**
 * The format name this protocol expects, or nothing for a type it cannot carry.
 *
 * Reading the MIME subtype as the format sent values the API rejects:
 * `image/svg+xml` became the format `svg+xml`, and the request then failed with
 * a validation error naming a field the user never set. The picture was lost
 * either way, but the error did not say that was what happened.
 *
 * A type nobody recorded is sent as PNG, which is what every image used to be
 * sent as. A type this protocol cannot carry returns nothing, so the caller can
 * say so instead of the API refusing the whole request.
 */
function imageFormat(mimeType: string | undefined): string | undefined {
  if (!mimeType) return "png";
  const subtype = mimeType.split("/")[1]?.toLowerCase();
  if (!subtype) return "png";
  if (subtype === "jpg") return "jpeg";
  return CONVERSE_IMAGE_FORMATS[subtype] === true ? subtype : undefined;
}

/** Arguments as an object, falling back to an empty one for text that is not JSON. */
function safeParse(arguments_: string): unknown {
  try {
    return arguments_ ? JSON.parse(arguments_) : {};
  } catch {
    return {};
  }
}
