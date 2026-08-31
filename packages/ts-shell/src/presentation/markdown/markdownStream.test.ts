import { describe, it, expect } from "vitest";
import {
  formatCodeBlockWithBorder,
  trimPartialClosingFences,
} from "./markdownStream.js";

describe("Streaming Markdown Code Fence Stabilizer", () => {
  it("trims partial trailing code fence markers to prevent flicker", () => {
    const textWithPartial = "Here is the code:\n```typescript\nconst x = 1;\n``";
    const res = trimPartialClosingFences(textWithPartial);

    expect(res.trimmed).toBe(true);
    expect(res.text).toBe("Here is the code:\n```typescript\nconst x = 1;");
  });

  it("leaves complete code fences untouched", () => {
    const complete = "```typescript\nconst x = 1;\n```";
    const res = trimPartialClosingFences(complete);

    expect(res.trimmed).toBe(false);
    expect(res.text).toBe(complete);
  });

  it("formats code blocks with decorative border", () => {
    const formatted = formatCodeBlockWithBorder("console.log('hi');", "ts");
    expect(formatted).toContain("[ts]");
    expect(formatted).toContain("console.log('hi');");
  });
});
