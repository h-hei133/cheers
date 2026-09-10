import { describe, expect, it } from "vitest";
import { diffPaint, prepareRows } from "../render/paint.js";
import { textBlock } from "../transcript/blocks.js";
import { Transcript } from "../transcript/container.js";
import { TranscriptPane } from "./pane.js";

/**
 * Frame budgets over a long conversation.
 *
 * A session that has run for an hour must still paint like one that just
 * started: finalized blocks come from cache, a streaming block re-lays only
 * itself, the pane slices a window without rendering twice, and the engine's
 * row diff touches only the rows that changed.
 */

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

/** Indices of the rows that differ, the same rows the engine would rewrite. */
function changedRows(before: readonly string[], after: readonly string[]): number[] {
  const changed: number[] = [];
  for (let index = 0; index < Math.max(before.length, after.length); index++) {
    if (before[index] !== after[index]) changed.push(index);
  }
  return changed;
}

describe("long-transcript budget", () => {
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

  it("windows a long transcript through the pane", () => {
    const transcript = buildTranscript(50);
    const pane = new TranscriptPane(transcript);
    const started = performance.now();
    const visible = pane.render(100, 30, undefined);
    const elapsed = performance.now() - started;
    expect(visible).toHaveLength(30);
    expect(pane.scrolledBack).toBe(0);
    expect(pane.scrollbarGeometry()).toBeDefined();
    expect(elapsed).toBeLessThan(1000);
  });

  it("diffs a streaming frame to a small changed range", () => {
    const transcript = buildTranscript(20);
    const before = prepareRows(transcript.render(100).rows, 100);
    const live = textBlock("assistant", "streaming...");
    live.finalized = false;
    transcript.append(live);
    const after = prepareRows(transcript.render(100).rows, 100);
    const changed = changedRows(before, after);
    expect(changed.length).toBeGreaterThan(0);
    expect(changed.length).toBeLessThan(30);
    // The engine rewrites exactly those rows: one cursor move per changed row.
    const paint = diffPaint(before, after, 0, after.length);
    expect(paint.split("\x1b[").length - 1).toBeLessThan(changed.length * 3);
  });
});
