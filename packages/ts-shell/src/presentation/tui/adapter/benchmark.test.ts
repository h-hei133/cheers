import { describe, expect, it } from "vitest";
import { Transcript } from "../transcript/container.js";
import { textBlock } from "../transcript/blocks.js";
import { ScrollView } from "./scroll.js";
import { diffLines } from "./screen.js";
import { Message } from "./messages.js";
import { ToolCard } from "./card.js";
import type { ViewComponent } from "./contract.js";

class TranscriptView implements ViewComponent {
  constructor(private readonly transcript: Transcript) {}
  invalidate(): void {}
  render(width: number): string[] {
    return [...this.transcript.render(Math.max(1, width)).rows];
  }
}

function buildTranscript(turns: number): Transcript {
  const transcript = new Transcript();
  for (let i = 0; i < turns; i++) {
    transcript.append({ kind: "user", text: `question ${i}: what does module ${i} do?`, finalized: true });
    transcript.append({
      kind: "thinking",
      text: `considering module ${i} across several candidate designs`,
      collapsed: true,
      finalized: true,
    });
    transcript.append({
      kind: "assistant",
      text: `# Answer ${i}\n\nModule ${i} owns its runtime boundary.\n\n\`\`\`ts\nconst value${i} = ${i};\n\`\`\``,
      finalized: true,
    });
    transcript.append({
      kind: "tool",
      title: "read",
      detail: `src/module-${i}.ts`,
      text: `line 1 of module ${i}\nline 2 of module ${i}`,
      collapsed: true,
      finalized: true,
    });
  }
  return transcript;
}

describe("phase 3 long-transcript benchmark", () => {
  it("renders 50 turns within a frame budget", () => {
    const transcript = buildTranscript(50);
    const started = performance.now();
    const rendered = transcript.render(100);
    const elapsed = performance.now() - started;
    expect(rendered.rows.length).toBeGreaterThan(500);
    expect(elapsed).toBeLessThan(1000);
  });

  it("re-renders a finalized transcript from cache", () => {
    const transcript = buildTranscript(50);
    transcript.render(100);
    const started = performance.now();
    transcript.render(100);
    const elapsed = performance.now() - started;
    expect(elapsed).toBeLessThan(200);
  });

  it("streams one block without re-laying finalized blocks", () => {
    const transcript = buildTranscript(20);
    const settled = transcript.render(100).rows.length;
    const live = textBlock("assistant", "streaming answer...");
    live.finalized = false;
    transcript.append(live);
    const started = performance.now();
    for (let i = 0; i < 20; i++) {
      live.text += " more";
      const rows = transcript.render(100).rows;
      expect(rows.length).toBeGreaterThan(settled);
      expect(rows.join("\n")).toContain("streaming answer...");
    }
    const elapsed = performance.now() - started;
    expect(elapsed).toBeLessThan(500);
  });

  it("scrolls a long transcript through a viewport", () => {
    const transcript = buildTranscript(50);
    const view = new ScrollView(new TranscriptView(transcript), { follow: "end" });
    const started = performance.now();
    const visible = view.visible(100, 30);
    const elapsed = performance.now() - started;
    expect(visible.length).toBe(30);
    expect(elapsed).toBeLessThan(1000);
  });

  it("diffs a streaming frame to a small changed range", () => {
    const transcript = buildTranscript(20);
    const before = transcript.render(100).rows;
    const live = textBlock("assistant", "streaming...");
    live.finalized = false;
    transcript.append(live);
    const after = transcript.render(100).rows;
    const diff = diffLines(before, after);
    expect(diff.noChange).toBe(false);
    expect(diff.lastChanged - diff.firstChanged).toBeLessThan(30);
  });

  it("renders product components over a long transcript", () => {
    const transcript = buildTranscript(10);
    const rows = transcript.render(100).rows;
    const message = new Message({ kind: "assistant", text: "# Summary\n\nDone.", finalized: true });
    const card = new ToolCard({ title: "bash", detail: "sleep 1", text: "ok", collapsed: true, finalized: true });
    const started = performance.now();
    const composed = [...rows, ...message.render(100), ...card.render(100)];
    const elapsed = performance.now() - started;
    expect(composed.length).toBeGreaterThan(rows.length);
    expect(elapsed).toBeLessThan(200);
  });
});
