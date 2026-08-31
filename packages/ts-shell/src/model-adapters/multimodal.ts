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

export function toAnthropicImageBlock(image: ImageContent): Record<string, unknown> {
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: image.mimeType,
      data: image.data,
    },
  };
}

export function toOpenAIImageUrlBlock(image: ImageContent): Record<string, unknown> {
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
