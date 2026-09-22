import { describe, it, expect } from "vitest";
import { deriveSessionTitleFromPrompt } from "./sessionLifecycleStore.js";

describe("deriveSessionTitleFromPrompt", () => {
  it("uses first non-empty line", () => {
    expect(deriveSessionTitleFromPrompt("\n\n  Hello world  \nnext line")).toBe("Hello world");
  });

  it("truncates long prompts", () => {
    const long = "A".repeat(100);
    const result = deriveSessionTitleFromPrompt(long);
    expect(result.length).toBeLessThanOrEqual(60);
    expect(result.endsWith("…")).toBe(true);
  });

  it("returns empty for empty prompt", () => {
    expect(deriveSessionTitleFromPrompt("")).toBe("");
    expect(deriveSessionTitleFromPrompt("\n\n")).toBe("");
  });

  it("collapses whitespace", () => {
    expect(deriveSessionTitleFromPrompt("hello   world  ")).toBe("hello world");
  });
});
