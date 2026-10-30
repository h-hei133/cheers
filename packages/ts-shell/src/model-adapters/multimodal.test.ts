import { describe, expect, it } from "vitest";
import {
  imagesOf,
  messageHasContent,
  messageToText,
  toAnthropicImageBlock,
  toOpenAIImageUrlBlock,
  type ImageContent,
  type MultimodalContentBlock,
} from "./multimodal.js";

describe("multimodal content admission", () => {
  it.each([undefined, null, "", "  \n", [], [{ type: "text", text: " " }], [{ type: "image", data: "", mimeType: "image/png" }]] as const)(
    "refuses empty content %j", content => { expect(messageHasContent(content)).toBe(false); });
  it.each(["real text", [{ type: "text", text: "real text" }], [{ type: "image", data: "aGVsbG8=", mimeType: "image/png" }],
    [{ type: "text", text: " " }, { type: "image", data: "aGVsbG8=", mimeType: "image/png" }]] as const)(
    "admits text or image content %j", content => { expect(messageHasContent(content)).toBe(true); });
});

describe("pictures carried by a message", () => {
  const picture: ImageContent = { type: "image", data: "aGVsbG8=", mimeType: "image/png" };

  it("returns images in attachment order and leaves text out", () => {
    const second: ImageContent = { type: "image", data: "d29ybGQ=", mimeType: "image/jpeg" };
    expect(imagesOf([{ type: "text", text: "two pictures" }, picture, second])).toEqual([picture, second]);
  });

  it.each([undefined, null, "", "plain text", [{ type: "text", text: "no picture" }], []] as const)(
    "has nothing to return for %j", content => { expect(imagesOf(content)).toEqual([]); });
});

/**
 * Messages that carry an image.
 *
 * Two things matter here and they pull in opposite directions. The text of a
 * message has to survive for the many readers that only want text — a title, a
 * log line, a search index — and the image has to survive for the one reader that
 * sends it to a model. A function that flattened the image away would be
 * invisible until someone noticed their picture had not been sent.
 */

const IMAGE: ImageContent = { type: "image", data: "aGVsbG8=", mimeType: "image/png" };
const MIXED: readonly MultimodalContentBlock[] = [
  { type: "text", text: "what is in this diagram?" },
  IMAGE,
];

describe("reading a message as text", () => {
  it("passes a plain string through", () => {
    expect(messageToText("hello")).toBe("hello");
  });

  it("reads the text of a message that also has an image", () => {
    expect(messageToText(MIXED)).toBe("what is in this diagram?");
  });

  it("joins several text blocks", () => {
    const blocks: readonly MultimodalContentBlock[] = [
      { type: "text", text: "first" },
      { type: "text", text: "second" },
    ];
    expect(messageToText(blocks)).toBe("first\nsecond");
  });

  it("says nothing for a message that is only an image", () => {
    // A placeholder here would put a line in a session title where the author
    // sent a picture. Content admission keeps its separate image check.
    expect(messageToText([IMAGE])).toBe("");
  });

  it("describes the image when the reader is showing it to a person", () => {
    // The other half of the same decision: a reader that displays the message
    // must not let the picture vanish without a trace.
    const described = messageToText([IMAGE], { placeholderForImages: true });
    expect(described).toContain("image/png");
  });

  it("handles absent content", () => {
    expect(messageToText(undefined)).toBe("");
    expect(messageToText(null)).toBe("");
  });
});

describe("the two wire shapes", () => {
  it("produces the Anthropic block", () => {
    // The endpoint takes the bytes and the media type as separate fields.
    expect(toAnthropicImageBlock(IMAGE)).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: "aGVsbG8=" },
    });
  });

  it("produces the OpenAI block", () => {
    // This one takes a single data URL instead.
    expect(toOpenAIImageUrlBlock(IMAGE)).toEqual({
      type: "image_url",
      image_url: { url: "data:image/png;base64,aGVsbG8=" },
    });
  });
});
