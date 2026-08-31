import { describe, it, expect, beforeEach } from "vitest";
import { TranscriptContainer } from "./transcriptContainer.js";

describe("TranscriptContainer", () => {
  let container: TranscriptContainer;

  beforeEach(() => {
    container = new TranscriptContainer();
  });

  it("appends user prompts and formats them with prompt symbol", () => {
    container.appendUserPrompt("How do I build the project?");
    const items = container.getItems();

    expect(items.length).toBe(1);
    expect(items[0].type).toBe("user");
    expect(items[0].content).toBe("How do I build the project?");

    const lines = container.render();
    expect(lines.some((l) => l.includes("How do I build the project?"))).toBe(true);
    expect(lines.some((l) => l.includes("❯"))).toBe(true);
  });

  it("appends slash command outputs without losing history", () => {
    container.appendUserPrompt("/help");
    container.appendCommandResult("/help", "Available commands:\n/model - Switch model\n/cost - Show cost");

    const items = container.getItems();
    expect(items.length).toBe(2);
    expect(items[1].type).toBe("command");
    expect(items[1].title).toBe("/help");

    const lines = container.render();
    expect(lines.some((l) => l.includes("Command Output"))).toBe(true);
    expect(lines.some((l) => l.includes("/model - Switch model"))).toBe(true);
  });

  it("appends assistant text responses and tool cards", () => {
    container.appendAssistantResponse("Here is the updated configuration:");
    container.appendToolResult("edit", "--- a/file.ts\n+++ b/file.ts\n+ const x = 1;", true);

    const items = container.getItems();
    expect(items.length).toBe(2);
    expect(items[0].type).toBe("assistant");
    expect(items[1].type).toBe("tool");

    const lines = container.render();
    expect(lines.some((l) => l.includes("Here is the updated configuration:"))).toBe(true);
    expect(lines.some((l) => l.includes("edit"))).toBe(true);
  });
});
