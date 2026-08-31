import { describe, it, expect } from "vitest";
import { makeStrictJsonSchema } from "./strictSchema.js";
import {
  isImageFilePath,
  getImageMimeType,
  toAnthropicImageBlock,
  toOpenAIImageUrlBlock,
  formatNonVisionFallback,
} from "./multimodal.js";

describe("Strict JSON Schema Compiler", () => {
  it("enforces additionalProperties: false and required keys recursively", () => {
    const rawSchema = {
      type: "object",
      $schema: "http://json-schema.org/draft-07/schema#",
      title: "ToolArgs",
      properties: {
        path: { type: "string" },
        limit: { type: "number" },
      },
    };

    const strict = makeStrictJsonSchema(rawSchema);
    expect(strict.$schema).toBeUndefined();
    expect(strict.title).toBeUndefined();
    expect(strict.additionalProperties).toBe(false);
    expect(strict.required).toEqual(["path", "limit"]);
  });
});

describe("Multimodal Pipeline Helpers", () => {
  it("detects image file paths and resolves MIME types", () => {
    expect(isImageFilePath("assets/logo.png")).toBe(true);
    expect(isImageFilePath("docs/diagram.svg")).toBe(true);
    expect(isImageFilePath("src/index.ts")).toBe(false);

    expect(getImageMimeType("photo.jpg")).toBe("image/jpeg");
    expect(getImageMimeType("icon.webp")).toBe("image/webp");
  });

  it("converts ImageContent to provider-specific wire blocks", () => {
    const img = {
      type: "image" as const,
      data: "aGVsbG8=",
      mimeType: "image/png",
    };

    const anthropicBlock = toAnthropicImageBlock(img);
    expect(anthropicBlock.type).toBe("image");
    expect((anthropicBlock.source as any).media_type).toBe("image/png");

    const openAiBlock = toOpenAIImageUrlBlock(img);
    expect(openAiBlock.type).toBe("image_url");
    expect((openAiBlock.image_url as any).url).toContain("data:image/png;base64,");

    const fallback = formatNonVisionFallback(img);
    expect(fallback).toContain("non-vision fallback");
  });
});
