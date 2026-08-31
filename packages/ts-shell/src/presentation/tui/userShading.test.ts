import { describe, it, expect, beforeEach } from "vitest";
import { TranscriptContainer } from "./transcriptContainer.js";

describe("User Message Shading & Transcript Rendering", () => {
  let container: TranscriptContainer;

  beforeEach(() => {
    container = new TranscriptContainer();
  });

  it("renders user prompts in full-width shaded background bubble", () => {
    container.appendUserPrompt("How do I build?");
    const lines = container.render(80);

    expect(lines.length).toBeGreaterThanOrEqual(3);
    // User message lines must contain the background ANSI sequence
    expect(lines.some((l) => l.includes("\x1b[48;5;236m"))).toBe(true);
    expect(lines.some((l) => l.includes("How do I build?"))).toBe(true);
  });
});
