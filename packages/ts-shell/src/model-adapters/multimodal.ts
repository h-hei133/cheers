/**
 * ImageContent & Multimodal Helpers
 *
 * Provides typed multimodal image blocks and multi-provider format converters:
 * - Anthropic: { type: "image", source: { type: "base64", media_type, data } }
 * - OpenAI: { type: "image_url", image_url: { url: "data:<mime>;base64,<data>" } }
 * - Non-vision fallback: "[Image: <mimeType> placeholder]"
 */

export interface ImageContent {
  readonly type: "image";
  readonly data: string; // base64 string
  readonly mimeType: string;
}

export interface TextContent {
  readonly type: "text";
  readonly text: string;
}

export type MultimodalContentBlock = TextContent | ImageContent;

const IMAGE_EXTENSION_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
};

export function isImageFilePath(filePath: string): boolean {
  if (!filePath || typeof filePath !== "string") return false;
  const lower = filePath.toLowerCase();
  for (const ext of Object.keys(IMAGE_EXTENSION_MAP)) {
    if (lower.endsWith(ext)) return true;
  }
  return false;
}

export function getImageMimeType(filePath: string): string {
  const lower = filePath.toLowerCase();
  for (const [ext, mime] of Object.entries(IMAGE_EXTENSION_MAP)) {
    if (lower.endsWith(ext)) return mime;
  }
  return "application/octet-stream";
}

/** One image block in the shape the Anthropic endpoint expects. */
export interface AnthropicImageBlock {
  readonly type: "image";
  readonly source: {
    readonly type: "base64";
    readonly media_type: string;
    readonly data: string;
  };
}

/** One image block in the shape an OpenAI-compatible endpoint expects. */
export interface OpenAIImageUrlBlock {
  readonly type: "image_url";
  readonly image_url: { readonly url: string };
}

export function toAnthropicImageBlock(image: ImageContent): AnthropicImageBlock {
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: image.mimeType,
      data: image.data,
    },
  };
}

export function toOpenAIImageUrlBlock(image: ImageContent): OpenAIImageUrlBlock {
  return {
    type: "image_url",
    image_url: {
      url: `data:${image.mimeType};base64,${image.data}`,
    },
  };
}

export function formatNonVisionFallback(image: ImageContent): string {
  return `[Image: ${image.mimeType} (${Math.round((image.data.length * 0.75) / 1024)}KB) - non-vision fallback]`;
}

/**
 * The text of a message, for a reader that cannot use an image.
 *
 * Most of this tree wants a string: a log line, a session title, a search index,
 * a token estimate. Those readers should not each learn what a content block is,
 * so they call this and get what they had before images existed.
 *
 * A message that is only an image yields the empty string by default, because
 * every one of those readers already treats empty content as "nothing to say",
 * and a placeholder would put a line in a title where the author wrote a picture.
 * A reader that is *showing* the message to a person passes
 * `placeholderForImages`, because there the alternative is that the picture
 * vanishes without a trace.
 */
export function messageToText(
  content: string | readonly MultimodalContentBlock[] | null | undefined,
  options: { readonly placeholderForImages?: boolean } = {},
): string {
  if (content === null || content === undefined) return "";
  if (typeof content === "string") return content;

  const texts: string[] = [];
  for (const block of content) {
    if (block.type === "text") {
      texts.push(block.text);
      continue;
    }
    if (options.placeholderForImages) texts.push(formatNonVisionFallback(block));
  }
  return texts.join("\n");
}

